; draft-one NSIS Custom Installer Script
; Seamlessly handles Windows Service lifecycle during version updates

!macro preInit
  ; Per-machine install. Do not reuse an old per-user directory under LocalAppData.
  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\150a135a-af77-530d-b015-221cc51f7831" "InstallLocation"
  ${If} $0 != ""
  ${AndIf} ${FileExists} "$0\draft-one.exe"
    StrCpy $INSTDIR $0
  ${Else}
    ${If} ${FileExists} "$PROGRAMFILES64\draft-one\draft-one.exe"
      StrCpy $INSTDIR "$PROGRAMFILES64\draft-one"
    ${ElseIf} ${FileExists} "$PROGRAMFILES\draft-one\draft-one.exe"
      StrCpy $INSTDIR "$PROGRAMFILES\draft-one"
    ${EndIf}
  ${EndIf}
!macroend

!macro customInit
  ; Stop our service first so it can stop its own mihomo child. Do not kill every mihomo.exe on the machine.
  nsExec::Exec 'cmd.exe /c "sc.exe stop DraftOneService & taskkill /F /IM draft-one.exe /T 2>nul"'
!macroend

!macro customInstall
  ; Writable data stays under the install directory. Users can modify only this folder.
  CreateDirectory "$INSTDIR\data"
  CreateDirectory "$INSTDIR\data\logs"
  nsExec::Exec 'icacls.exe "$INSTDIR\data" /grant *S-1-5-32-545:(OI)(CI)M /T'
  ; The installer runs elevated and installs under Program Files, so service registration is part of setup.
  nsExec::Exec 'sc.exe create DraftOneService binPath= "$INSTDIR\resources\binaries\DraftOneService.exe" start= auto DisplayName= "draft-one Core Proxy Service"'
  nsExec::Exec 'sc.exe description DraftOneService "draft-one starts mihomo at boot and the tray at user logon"'
  nsExec::Exec 'sc.exe config DraftOneService binPath= "$INSTDIR\resources\binaries\DraftOneService.exe" start= auto'
  nsExec::Exec 'sc.exe start DraftOneService'
  ; Interactive logon entry. This runs on the user desktop, which is what the tray needs.
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "draft-one" '"$INSTDIR\draft-one.exe" --silent'
  ; Leave DraftOne_AutoStart in place. The app deletes only a highest-privilege task that is not interactive.
!macroend

!macro customUnInit
  ; Stop and delete service cleanly during complete uninstall
  nsExec::Exec 'cmd.exe /c "sc.exe stop DraftOneService 2>nul"'
  nsExec::Exec 'cmd.exe /c "sc.exe delete DraftOneService 2>nul"'
  nsExec::Exec 'cmd.exe /c "taskkill /F /IM draft-one.exe /T 2>nul"'
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "draft-one"
  nsExec::Exec 'schtasks.exe /Delete /TN "DraftOne_AutoStart" /F 2>nul'
  nsExec::Exec 'netsh.exe advfirewall firewall delete rule name=DraftOne_App'
  nsExec::Exec 'netsh.exe advfirewall firewall delete rule name=DraftOne_Core'
  RMDir /r "$INSTDIR\data"
!macroend
