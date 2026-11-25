!macro NSIS_HOOK_PREINSTALL
  nsExec::Exec 'taskkill /IM aspis-server.exe /T /F'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::Exec '"$INSTDIR\aspis-server.exe" agents remove'
  nsExec::Exec '"$INSTDIR\aspis-server.exe" tasks clear'
  nsExec::Exec 'taskkill /IM aspis-server.exe /T /F'
!macroend
