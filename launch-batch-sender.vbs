Option Explicit

Dim shell, fileSystem, appDirectory, electronPath
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")
appDirectory = fileSystem.GetParentFolderName(WScript.ScriptFullName)
electronPath = fileSystem.BuildPath(appDirectory, "node_modules\electron\dist\electron.exe")

If Not fileSystem.FileExists(electronPath) Then
  MsgBox "Batch Sender is incomplete. Extract the full Windows ZIP before launching.", 16, "Batch Sender"
  WScript.Quit 1
End If

shell.CurrentDirectory = appDirectory
shell.Run Chr(34) & electronPath & Chr(34) & " " & Chr(34) & appDirectory & Chr(34), 0, False
