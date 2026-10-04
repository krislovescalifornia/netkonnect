!macro customInstall
  ; Every packaged process uses this EXE. Deny outbound TCP/UDP at the OS layer.
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="netKonnect Offline"'
  Pop $0
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall add rule name="netKonnect Offline" dir=out action=block program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" enable=yes profile=any'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "Windows could not create the netKonnect outbound block rule. Installation cannot complete. Enable Windows Firewall and try again."
    Abort
  ${EndIf}
  ; Installation prepares full collection in one pass under its existing UAC.
  ; The bundled setup is also used by the dashboard Easy Button for repair.
  SetShellVarContext current
  DetailPrint "Setting up background collection, detailed capture and automatic startup..."
  nsExec::ExecToLog '"$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\app\desktop\manage-capture.ps1" -Action Enable -ForInstaller'
  Pop $0
  ${If} $0 != 0
    DetailPrint "Background setup needs attention. Open netKonnect and click Easy Button to finish setup for your Windows account."
  ${EndIf}
!macroend

!macro customUnInstall
  SetShellVarContext current
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "netKonnect Companion"
  nsExec::ExecToLog '"$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\app\desktop\manage-capture.ps1" -Action DisableAll'
  Pop $0
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="netKonnect Offline"'
  Pop $0
  ; Retain history on uninstall. It belongs to the user.
!macroend
