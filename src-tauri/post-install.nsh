; post-install.nsh — extracts pi-server.zip during NSIS installation
; This avoids the first-launch extraction delay.
; Uses PowerShell's built-in Expand-Archive which is available on
; Windows 10+ / Windows Server 2016+ without any additional tools.

!macro PostInstall
  DetailPrint "Extracting AI engine (pi-server)…"
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -InputFormat None -Command "try { Expand-Archive -Path ''$INSTDIR\pi-server.zip'' -DestinationPath ''$INSTDIR\pi-server'' -Force; Write-Host OK } catch { $_.Exception.Message }"'
  Pop $0
  Pop $1
  ${If} $1 != "OK"
    DetailPrint "Extraction warning: $1 (will extract on first launch instead)"
  ${EndIf}
!macroend
