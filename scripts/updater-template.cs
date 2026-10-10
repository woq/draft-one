using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("draft-one Updater")]
[assembly: AssemblyProduct("draft-one")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

public class Program
{
    private const string ServiceName = "DraftOneService";
    private const string AppProcessName = "draft-one";
    private const string MihomoProcessName = "mihomo";

    [STAThread]
    public static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        try
        {
            // 1. Locate install directory
            string targetDir = FindTargetDir();
            if (string.IsNullOrEmpty(targetDir) || !Directory.Exists(targetDir))
            {
                MessageBox.Show(
                    "未能自动检测到 draft-one 的安装目录，请确认程序已安装在系统中！",
                    "draft-one 升级助手",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                return;
            }

            // 2. Kill processes & stop service to release file locks
            KillProcesses();
            StopService();

            // 3. Extract embedded payload to targetDir
            ExtractPayload(targetDir);

            // 4. Update service binary path and restart service if installed
            StartServiceIfInstalled(targetDir);

            // 5. Restart the desktop app. Leave data\ and DraftOne_AutoStart in place.
            string appExe = Path.Combine(targetDir, "draft-one.exe");
            if (File.Exists(appExe))
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = appExe,
                    WorkingDirectory = targetDir
                });
            }

            MessageBox.Show(
                "draft-one 升级完成，客户端已重新启动。",
                "draft-one 一键升级",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information
            );
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "升级过程中出现异常:\n" + ex.Message,
                "draft-one 升级失败",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
        }
    }

    private static string FindTargetDir()
    {
        // 1. Per-machine uninstall entry under HKLM. Do not follow an old per-user HKCU install.
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
                            string loc = val.ToString().Trim();
                            if (File.Exists(Path.Combine(loc, "draft-one.exe"))) return loc;
                        }
                    }
                }
            }
            catch {}
        }

        // 2. Check parent of updater (if launched inside install dir)
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        if (File.Exists(Path.Combine(baseDir, "draft-one.exe"))) return baseDir;

        // 3. Check standard Program Files
        string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        string c1 = Path.Combine(pf, "draft-one");
        if (File.Exists(Path.Combine(c1, "draft-one.exe"))) return c1;

        // 4. Check Program Files (x86)
        string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        string c2 = Path.Combine(pf86, "draft-one");
        if (File.Exists(Path.Combine(c2, "draft-one.exe"))) return c2;

        // 5. Check hardcoded standard paths
        if (File.Exists(@"C:\Program Files\draft-one\draft-one.exe")) return @"C:\Program Files\draft-one";

        return null;
    }

    private static void KillProcesses()
    {
        // Intentional: stop every mihomo so app.asar and the service binary can be replaced.
        // The installed GUI still only kills the mihomo PID it spawned itself.
        string[] procs = new string[] { AppProcessName, MihomoProcessName };
        foreach (string name in procs)
        {
            try
            {
                foreach (Process p in Process.GetProcessesByName(name))
                {
                    try
                    {
                        p.Kill();
                        p.WaitForExit(1500);
                    }
                    catch {}
                }
            }
            catch {}
        }
    }

    private static void StopService()
    {
        try
        {
            ProcessStartInfo psi = new ProcessStartInfo("sc.exe", "stop " + ServiceName)
            {
                CreateNoWindow = true,
                UseShellExecute = false
            };
            Process p = Process.Start(psi);
            if (p != null) p.WaitForExit(2000);
        }
        catch {}
    }

    private static void StartServiceIfInstalled(string targetDir)
    {
        try
        {
            string serviceExe = Path.Combine(targetDir, "resources", "binaries", "DraftOneService.exe");
            if (File.Exists(serviceExe))
            {
                ProcessStartInfo cfgPsi = new ProcessStartInfo("sc.exe", string.Format("config {0} binPath= \"{1}\"", ServiceName, serviceExe))
                {
                    CreateNoWindow = true,
                    UseShellExecute = false
                };
                Process cfgP = Process.Start(cfgPsi);
                if (cfgP != null) cfgP.WaitForExit(2000);
            }

            ProcessStartInfo psi = new ProcessStartInfo("sc.exe", "start " + ServiceName)
            {
                CreateNoWindow = true,
                UseShellExecute = false
            };
            Process p = Process.Start(psi);
            if (p != null) p.WaitForExit(2000);
        }
        catch {}
    }

    private static void ExtractPayload(string targetDir)
    {
        Assembly asm = Assembly.GetExecutingAssembly();
        using (Stream stream = asm.GetManifestResourceStream("payload.zip"))
        {
            if (stream == null)
            {
                throw new InvalidOperationException("升级资源包损坏或未内嵌 payload.zip！");
            }

            using (ZipArchive archive = new ZipArchive(stream, ZipArchiveMode.Read))
            {
                foreach (ZipArchiveEntry entry in archive.Entries)
                {
                    if (string.IsNullOrEmpty(entry.Name)) continue; // skip dir entries

                    string destPath = Path.Combine(targetDir, entry.FullName);
                    string destDir = Path.GetDirectoryName(destPath);
                    if (!Directory.Exists(destDir))
                    {
                        Directory.CreateDirectory(destDir);
                    }

                    // Retry up to 3 times in case of lingering locks
                    for (int retry = 0; retry < 3; retry++)
                    {
                        try
                        {
                            entry.ExtractToFile(destPath, true);
                            break;
                        }
                        catch
                        {
                            if (retry == 2) throw;
                            Thread.Sleep(500);
                        }
                    }
                }
            }
        }
    }
}
