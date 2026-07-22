Option Explicit

Dim shell, fileSystem, appDirectory, desktopDirectory, shortcut
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")
appDirectory = fileSystem.GetParentFolderName(WScript.ScriptFullName)
desktopDirectory = shell.SpecialFolders("Desktop")

Set shortcut = shell.CreateShortcut(fileSystem.BuildPath(desktopDirectory, "Batch Sender.lnk"))
shortcut.TargetPath = fileSystem.BuildPath(appDirectory, "node_modules\electron\dist\electron.exe")
shortcut.Arguments = """" & appDirectory & """"
shortcut.WorkingDirectory = appDirectory
shortcut.IconLocation = fileSystem.BuildPath(appDirectory, "assets\batch-sender.ico") & ",0"
shortcut.Description = "Aephia Batch Sender"
shortcut.Save

MsgBox "Batch Sender shortcut created on the desktop.", 64, "Batch Sender"
