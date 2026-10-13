!macro NSIS_HOOK_PREINSTALL
  nsExec::Exec 'taskkill /IM aspis-server.exe /T /F'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::Exec 'taskkill /IM aspis-server.exe /T /F'
  nsExec::Exec 'schtasks /Delete /TN "\Dyarchia Aspis\Dispatcher" /F'
!macroend
