using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.ServiceProcess;
using System.Text;
using System.Threading;
using Microsoft.Win32;

public class DraftOneService : ServiceBase
{
    private Process _coreProcess;
    private Timer _restartTimer;
    private Timer _stableTimer;
    private int _coreRestarts;
    private bool _stopping;
    private static string _logFilePath;

    public DraftOneService()
    {
        this.ServiceName = "DraftOneService";
        this.CanStop = true;
        this.CanPauseAndContinue = false;
        this.CanHandleSessionChangeEvent = true;
        this.AutoLog = false;
        InitLogger();
    }

    private static readonly object LogGate = new object();
    private static long _logBytes;
    private const long MaxLogBytes = 4 * 1024 * 1024;
    private const int MaxLogParts = 4;

    private static string InstallDataDir()
    {
        string baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
        string installDir = Path.GetFullPath(Path.Combine(baseDir, "..", ".."));
        return Path.Combine(installDir, "data");
    }

    private static void InitLogger()
    {
        try
        {
            string logDir = Path.Combine(InstallDataDir(), "logs");
            Directory.CreateDirectory(logDir);
            _logFilePath = Path.Combine(logDir, "service.log");
            MaintainServiceLog();
            _logBytes = File.Exists(_logFilePath) ? new FileInfo(_logFilePath).Length : 0;
        }
        catch
        {
            _logFilePath = null;
        }
    }

    private static void RotateServiceLog()
    {
        string oldest = _logFilePath + "." + (MaxLogParts - 1);
        if (File.Exists(oldest)) File.Delete(oldest);
        for (int i = MaxLogParts - 2; i >= 1; i--)
        {
            string src = _logFilePath + "." + i;
            string dst = _logFilePath + "." + (i + 1);
            if (!File.Exists(src)) continue;
            if (File.Exists(dst)) File.Delete(dst);
            File.Move(src, dst);
        }
        string first = _logFilePath + ".1";
        if (File.Exists(_logFilePath))
        {
            if (File.Exists(first)) File.Delete(first);
            File.Move(_logFilePath, first);
        }
        _logBytes = 0;
    }

    private static void TrimServiceLogTail(string file)
    {
        FileInfo info = new FileInfo(file);
        if (!info.Exists || info.Length <= MaxLogBytes) return;
        string tmp = file + ".trim";
        if (File.Exists(tmp)) File.Delete(tmp);
        using (FileStream input = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
        using (FileStream output = new FileStream(tmp, FileMode.Create, FileAccess.Write, FileShare.None))
        {
            input.Seek(info.Length - MaxLogBytes, SeekOrigin.Begin);
            int current = input.ReadByte();
            while (current != -1 && current != 10) current = input.ReadByte();
            byte[] buf = new byte[8192];
            int read = input.Read(buf, 0, buf.Length);
            while (read > 0)
            {
                output.Write(buf, 0, read);
                read = input.Read(buf, 0, buf.Length);
            }
        }
        File.Delete(file);
        File.Move(tmp, file);
    }

    private static void MaintainServiceLog()
    {
        if (string.IsNullOrEmpty(_logFilePath)) return;
        string dir = Path.GetDirectoryName(_logFilePath);
        string baseName = Path.GetFileName(_logFilePath);
        if (!Directory.Exists(dir)) return;
        try
        {
        foreach (string full in Directory.GetFiles(dir, baseName + ".*"))
        {
            string name = Path.GetFileName(full);
            string rest = name.Substring(baseName.Length + 1);
            int index;
            bool numeric = int.TryParse(rest, out index);
            if (rest == "trim" || !numeric || index.ToString() != rest || index < 1 || index >= MaxLogParts)
            {
                File.Delete(full);
            }
        }
        TrimServiceLogTail(_logFilePath);
        for (int i = 1; i < MaxLogParts; i++) TrimServiceLogTail(_logFilePath + "." + i);
        }
        catch
        {
        }
    }

    public static void Log(string level, string message)
    {
        lock (LogGate)
        {
            try
            {
                if (string.IsNullOrEmpty(_logFilePath)) InitLogger();
                if (string.IsNullOrEmpty(_logFilePath)) return;
                string line = string.Format("[{0:yyyy-MM-dd HH:mm:ss.fff}] [{1}] {2}{3}", DateTime.Now, level, message, Environment.NewLine);
                int bytes = Encoding.UTF8.GetByteCount(line);
                if (_logBytes > MaxLogBytes)
                {
                    MaintainServiceLog();
                    _logBytes = File.Exists(_logFilePath) ? new FileInfo(_logFilePath).Length : 0;
                }
                if (_logBytes > 0 && _logBytes + bytes > MaxLogBytes) RotateServiceLog();
                File.AppendAllText(_logFilePath, line, Encoding.UTF8);
                _logBytes += bytes;
            }
            catch {}
        }
    }

    private static string GetInstallLocationFromRegistry()
    {
        string[] subKeys = new string[]
        {
            @"Software\Microsoft\Windows\CurrentVersion\Uninstall\150a135a-af77-530d-b015-221cc51f7831",
            @"Software\Microsoft\Windows\CurrentVersion\Uninstall\c9ea6c31-7e8e-5b2d-96ce-63d1ef964aa8",
            @"Software\Microsoft\Windows\CurrentVersion\Uninstall\draft-one"
        };

        foreach (string sk in subKeys)
        {
            try
            {
                using (RegistryKey k = Registry.LocalMachine.OpenSubKey(sk))
                {
                    if (k != null)
                    {
                        object val = k.GetValue("InstallLocation");
                        if (val != null && !string.IsNullOrEmpty(val.ToString()))
                        {
                            return val.ToString();
                        }
                    }
                }
            }
            catch {}
        }
        return null;
    }

    private enum CoreStartResult
    {
        Started,
        Rejected,
        Failed
    }

    private static string Sha256Hex(string file)
    {
        using (SHA256 sha = SHA256.Create())
        using (FileStream stream = File.OpenRead(file))
        {
            byte[] hash = sha.ComputeHash(stream);
            StringBuilder builder = new StringBuilder(hash.Length * 2);
            foreach (byte part in hash) builder.Append(part.ToString("x2"));
            return builder.ToString();
        }
    }

    private static bool HashApproved(string corePath, out string error)
    {
        error = null;
        string hashPath = Path.Combine(Path.GetDirectoryName(corePath), "mihomo.sha256");
        if (!File.Exists(hashPath))
        {
            Log("WARN", "mihomo.sha256 is missing. Starting mihomo.exe without a hash check.");
            return true;
        }

        string actual = Sha256Hex(corePath);
        string expected = File.ReadAllText(hashPath).Trim().ToLowerInvariant();
        int space = expected.IndexOfAny(new char[] { ' ', '\t' });
        if (space > 0) expected = expected.Substring(0, space);
        if (expected != actual)
        {
            error = "mihomo.exe hash does not match mihomo.sha256. Refusing to start. Reinstall the system service to approve this file.";
            return false;
        }
        return true;
    }

    private CoreStartResult StartCore()
    {
        if (_stopping) return CoreStartResult.Rejected;
        try
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
            string corePath = Path.Combine(baseDir, "mihomo.exe");
            Log("INFO", "Service BaseDirectory: " + baseDir);
            if (!File.Exists(corePath))
            {
                Log("ERROR", "mihomo.exe is not beside DraftOneService.exe: " + corePath);
                return CoreStartResult.Rejected;
            }

            string hashError;
            if (!HashApproved(corePath, out hashError))
            {
                Log("ERROR", hashError);
                return CoreStartResult.Rejected;
            }

            string configDir = InstallDataDir();
            Directory.CreateDirectory(configDir);
            string configFile = Path.Combine(configDir, "config.yaml");
            Log("INFO", "Active config path: " + configFile + " (exists: " + File.Exists(configFile) + ")");
            InstallBundledAntiAd(configDir, Path.GetDirectoryName(corePath));
            string arguments = string.Format("-d \"{0}\" -f \"{1}\"", configDir, configFile);
            Log("INFO", "Core arguments: " + arguments);

            Process proc = new Process();
            proc.StartInfo = new ProcessStartInfo
            {
                FileName = corePath,
                Arguments = arguments,
                WorkingDirectory = Directory.Exists(configDir) ? configDir : baseDir,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            };
            proc.EnableRaisingEvents = true;
            proc.OutputDataReceived += (s, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data)) Log("CORE-OUT", e.Data);
            };
            proc.ErrorDataReceived += (s, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data)) Log("CORE-ERR", e.Data);
            };
            proc.Exited += (s, e) => OnCoreExited(proc);
            proc.Start();
            proc.BeginOutputReadLine();
            proc.BeginErrorReadLine();
            _coreProcess = proc;
            Log("INFO", "mihomo.exe core process started successfully (PID: " + proc.Id + ")");
            if (_stableTimer != null) _stableTimer.Dispose();
            _stableTimer = new Timer(delegate { _coreRestarts = 0; }, null, 15000, Timeout.Infinite);
            return CoreStartResult.Started;
        }
        catch (Exception ex)
        {
            Log("ERROR", "Exception in StartCore: " + ex);
            return CoreStartResult.Failed;
        }
    }

    private void OnCoreExited(Process proc)
    {
        int code = -1;
        try { code = proc.ExitCode; } catch { }
        Log("WARN", "mihomo.exe process exited (ExitCode: " + code + ")");
        if (_stopping) return;
        if (!object.ReferenceEquals(_coreProcess, proc)) return;
        ScheduleCoreRestart();
    }

    private void ScheduleCoreRestart()
    {
        if (_stopping) return;
        if (_stableTimer != null)
        {
            _stableTimer.Dispose();
            _stableTimer = null;
        }
        if (_coreRestarts >= 5)
        {
            Log("ERROR", "mihomo exited and was not restarted after 5 attempts.");
            return;
        }
        int delay = _coreRestarts == 0 ? 1000 : _coreRestarts == 1 ? 2000 : 4000;
        _coreRestarts++;
        Log("WARN", "Restarting mihomo in " + delay + "ms (" + _coreRestarts + "/5).");
        if (_restartTimer != null) _restartTimer.Dispose();
        _restartTimer = new Timer(delegate { StartCoreOrRetry(); }, null, delay, Timeout.Infinite);
    }

    private void StartCoreOrRetry()
    {
        if (_stopping) return;
        CoreStartResult result = StartCore();
        if (result == CoreStartResult.Failed) ScheduleCoreRestart();
    }

    protected override void OnStart(string[] args)
    {
        Log("INFO", "==================================================");
        Log("INFO", "DraftOneService Starting (Win32 Background Daemon)");
        Log("INFO", "OS: " + Environment.OSVersion.ToString() + ", 64Bit: " + Environment.Is64BitOperatingSystem);
        _stopping = false;
        _coreRestarts = 0;
        StartCoreOrRetry();
    }

    protected override void OnSessionChange(SessionChangeDescription changeDescription)
    {
        Log("INFO", "Session change: " + changeDescription.Reason + " id=" + changeDescription.SessionId);
        if (changeDescription.Reason == SessionChangeReason.SessionLogon)
        {
            LaunchGuiInSession((uint)changeDescription.SessionId);
        }
    }

    private static string _guiSessions = ",";

    private static void InstallBundledAntiAd(string configDir, string coreDir)
    {
        try
        {
            if (string.IsNullOrEmpty(configDir)) return;
            string dest = Path.Combine(configDir, "providers", "anti-ad.yaml");
            if (File.Exists(dest)) return;
            string bundled = Path.Combine(coreDir ?? "", "anti-ad.yaml");
            if (!File.Exists(bundled)) return;
            Directory.CreateDirectory(Path.GetDirectoryName(dest));
            File.Copy(bundled, dest, false);
            Log("INFO", "Installed bundled anti-ad.yaml to " + dest);
        }
        catch (Exception ex)
        {
            Log("WARN", "Could not install bundled anti-ad.yaml: " + ex.Message);
        }
    }

    private static string FindGuiExe()
    {
        string baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
        string installDir = Path.GetFullPath(Path.Combine(baseDir, "..", ".."));
        string exe = Path.Combine(installDir, "draft-one.exe");
        if (File.Exists(exe)) return exe;

        string regInstall = GetInstallLocationFromRegistry();
        if (!string.IsNullOrEmpty(regInstall))
        {
            exe = Path.Combine(regInstall.TrimEnd('\\', '/'), "draft-one.exe");
            if (File.Exists(exe)) return exe;
        }
        return null;
    }

    /// <summary>
    /// Session 0 cannot own a notification icon. Start the GUI with the logged-on user's token
    /// on winsta0\default so the tray is created in that desktop.
    /// </summary>
    private static void LaunchGuiInSession(uint sessionId)
    {
        if (sessionId == 0 || sessionId == 0xFFFFFFFF)
        {
            Log("INFO", "Skip GUI launch for non-interactive session " + sessionId);
            return;
        }
        string sessionKey = "," + sessionId + ",";
        if (_guiSessions.Contains(sessionKey))
        {
            Log("INFO", "GUI already launched for session " + sessionId);
            return;
        }

        IntPtr token = IntPtr.Zero;
        IntPtr env = IntPtr.Zero;
        try
        {
            string exe = FindGuiExe();
            if (string.IsNullOrEmpty(exe))
            {
                Log("WARN", "draft-one.exe not found. Tray depends on the HKCU Run entry.");
                return;
            }

            if (!WTSQueryUserToken(sessionId, out token))
            {
                Log("WARN", "WTSQueryUserToken failed for session " + sessionId + " error=" + Marshal.GetLastWin32Error());
                return;
            }

            if (!CreateEnvironmentBlock(out env, token, false))
            {
                Log("WARN", "CreateEnvironmentBlock failed error=" + Marshal.GetLastWin32Error());
                env = IntPtr.Zero;
            }

            STARTUPINFO si = new STARTUPINFO();
            si.cb = Marshal.SizeOf(si);
            si.lpDesktop = "winsta0\\default";
            PROCESS_INFORMATION pi;
            string cmd = "\"" + exe + "\" --silent";
            string workDir = Path.GetDirectoryName(exe);
            uint flags = env == IntPtr.Zero ? 0u : 0x00000400u;

            bool ok = CreateProcessAsUser(
                token,
                exe,
                cmd,
                IntPtr.Zero,
                IntPtr.Zero,
                false,
                flags,
                env,
                workDir,
                ref si,
                out pi
            );
            if (!ok)
            {
                Log("ERROR", "CreateProcessAsUser failed error=" + Marshal.GetLastWin32Error() + " exe=" + exe);
                return;
            }

            _guiSessions += sessionId + ",";
            Log("INFO", "Launched desktop GUI in session " + sessionId + " pid=" + pi.dwProcessId);
            if (pi.hProcess != IntPtr.Zero) CloseHandle(pi.hProcess);
            if (pi.hThread != IntPtr.Zero) CloseHandle(pi.hThread);
        }
        catch (Exception ex)
        {
            Log("ERROR", "LaunchGuiInSession: " + ex.Message);
        }
        finally
        {
            if (env != IntPtr.Zero) DestroyEnvironmentBlock(env);
            if (token != IntPtr.Zero) CloseHandle(token);
        }
    }

    [DllImport("wtsapi32.dll", SetLastError = true)]
    private static extern bool WTSQueryUserToken(uint sessionId, out IntPtr phToken);

    [DllImport("userenv.dll", SetLastError = true)]
    private static extern bool CreateEnvironmentBlock(out IntPtr lpEnvironment, IntPtr hToken, bool bInherit);

    [DllImport("userenv.dll", SetLastError = true)]
    private static extern bool DestroyEnvironmentBlock(IntPtr lpEnvironment);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr hObject);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CreateProcessAsUser(
        IntPtr hToken,
        string lpApplicationName,
        string lpCommandLine,
        IntPtr lpProcessAttributes,
        IntPtr lpThreadAttributes,
        bool bInheritHandles,
        uint dwCreationFlags,
        IntPtr lpEnvironment,
        string lpCurrentDirectory,
        ref STARTUPINFO lpStartupInfo,
        out PROCESS_INFORMATION lpProcessInformation);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct STARTUPINFO
    {
        public int cb;
        public string lpReserved;
        public string lpDesktop;
        public string lpTitle;
        public int dwX;
        public int dwY;
        public int dwXSize;
        public int dwYSize;
        public int dwXCountChars;
        public int dwYCountChars;
        public int dwFillAttribute;
        public int dwFlags;
        public short wShowWindow;
        public short cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESS_INFORMATION
    {
        public IntPtr hProcess;
        public IntPtr hThread;
        public int dwProcessId;
        public int dwThreadId;
    }

    protected override void OnStop()
    {
        Log("INFO", "DraftOneService Stopping...");
        _stopping = true;
        if (_restartTimer != null) _restartTimer.Dispose();
        if (_stableTimer != null) _stableTimer.Dispose();
        try
        {
            if (_coreProcess != null && !_coreProcess.HasExited)
            {
                _coreProcess.Kill();
                _coreProcess.WaitForExit(3000);
                Log("INFO", "mihomo core process terminated.");
            }
        }
        catch (Exception ex)
        {
            Log("ERROR", "Error stopping core process: " + ex.Message);
        }
        Log("INFO", "DraftOneService Stopped cleanly.");
        Log("INFO", "==================================================");
    }

    public static void Main(string[] args)
    {
        ServiceBase.Run(new DraftOneService());
    }
}
