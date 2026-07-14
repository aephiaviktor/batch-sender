Option Explicit

Dim shell, fileSystem, appDirectory
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")
appDirectory = fileSystem.GetParentFolderName(WScript.ScriptFullName)

shell.CurrentDirectory = appDirectory
Shell.Run "cmd.exe /d /s /c ""npm start""", 0, False
