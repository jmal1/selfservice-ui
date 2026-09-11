BEGIN;
INSERT INTO actions (name, slug, description, action_type, action_category, script, input_context, output_context, timeout_seconds, is_library, params, supported_platforms) VALUES

('Windows Service Running', 'win-service-running', 'Checks if a Windows service is running via PowerShell', 'service_check', 'service',
'$name = ""
foreach ($arg in $args) {
    if ($arg -eq "--name") { $name = $args[$args.IndexOf($arg)+1] }
}
$svc = Get-Service -Name $name -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq "Running") {
    ctx_set "service_${name}_status" "Running"
    exit 0
} else {
    $env:LAST_ERROR = "Service $name is not running"
    $env:LAST_STUDENT_MSG = "Service $name is not running. Start it in services.msc or with: Start-Service $name"
    exit 1
}',
'[{"key":"name","type":"string","description":"Windows service name"}]',
'[{"key":"service_NAME_status","type":"string","description":"Service status"}]',
15, true, '{}', '["windows"]'),

('Windows File Contains', 'win-file-contains', 'Checks if a file contains a specific string using PowerShell Select-String', 'file_check', 'file',
'$path = ""; $value = ""; $regex = $false
for ($i=0; $i -lt $args.Count; $i++) {
    switch ($args[$i]) {
        "--path" { $path = $args[++$i] }
        "--value" { $value = $args[++$i] }
        "--regex" { $regex = $true }
    }
}
if (-not (Test-Path $path)) {
    $env:LAST_ERROR = "File not found: $path"
    $env:LAST_STUDENT_MSG = "File $path does not exist."
    exit 1
}
if ($regex) {
    $match = Select-String -Path $path -Pattern $value -Quiet
} else {
    $match = Select-String -Path $path -SimpleMatch $value -Quiet
}
if ($match) { exit 0 }
$env:LAST_ERROR = "File $path does not contain ''$value''"
$env:LAST_STUDENT_MSG = "Expected ''$value'' in $path"
exit 1',
'[{"key":"path","type":"string","description":"File path"},{"key":"value","type":"string","description":"String or regex to find"},{"key":"regex","type":"boolean","description":"Use regex (default: false)"}]',
'[]',
10, true, '{}', '["windows"]'),

('Windows Firewall Enabled', 'win-firewall-enabled', 'Checks if Windows Firewall profiles are enabled', 'service_check', 'firewall',
'$profiles = Get-NetFirewallProfile | Where-Object { $_.Enabled -eq $true }
if ($profiles.Count -ge 1) {
    ctx_set "firewall_status" "enabled"
    ctx_set "firewall_profiles" ($profiles.Name -join ",")
    exit 0
} else {
    $env:LAST_ERROR = "Windows Firewall is not enabled"
    $env:LAST_STUDENT_MSG = "Windows Firewall is disabled. Enable it in Windows Security settings."
    exit 1
}',
'[]',
'[{"key":"firewall_status","type":"string","description":"enabled if any profile is on"},{"key":"firewall_profiles","type":"string","description":"Comma-separated active profile names"}]',
10, true, '{}', '["windows"]'),

('Windows Firewall Rule Exists', 'win-firewall-rule-exists', 'Checks if a specific Windows Firewall rule exists and is enabled', 'service_check', 'firewall',
'$ruleName = ""
for ($i=0; $i -lt $args.Count; $i++) {
    if ($args[$i] -eq "--rule") { $ruleName = $args[++$i] }
}
$rule = Get-NetFirewallRule -DisplayName "*$ruleName*" -ErrorAction SilentlyContinue | Where-Object { $_.Enabled -eq "True" }
if ($rule) { exit 0 }
$env:LAST_ERROR = "Firewall rule not found: $ruleName"
$env:LAST_STUDENT_MSG = "Missing or disabled firewall rule: $ruleName"
exit 1',
'[{"key":"rule","type":"string","description":"Firewall rule display name pattern"}]',
'[]',
10, true, '{}', '["windows"]'),

('Windows Package Installed', 'win-package-installed', 'Checks if a program is installed on Windows (via registry or Get-Package)', 'service_check', 'service',
'$name = ""
for ($i=0; $i -lt $args.Count; $i++) {
    if ($args[$i] -eq "--name") { $name = $args[++$i] }
}
$found = Get-Package -Name "*$name*" -ErrorAction SilentlyContinue
if (-not $found) {
    $found = Get-ItemProperty "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*" |
        Where-Object { $_.DisplayName -like "*$name*" }
}
if ($found) { exit 0 }
$env:LAST_ERROR = "Package $name is not installed"
$env:LAST_STUDENT_MSG = "Package $name is not installed on this Windows system."
exit 1',
'[{"key":"name","type":"string","description":"Program/package name to search for"}]',
'[]',
15, true, '{}', '["windows"]'),

('Windows Command Check', 'win-command-check', 'Runs a PowerShell command and asserts output and exit code', 'command', 'general',
'$cmd = ""; $expectOutput = ""; $expectExit = 0
for ($i=0; $i -lt $args.Count; $i++) {
    switch ($args[$i]) {
        "--cmd" { $cmd = $args[++$i] }
        "--expect-output" { $expectOutput = $args[++$i] }
        "--expect-exit" { $expectExit = [int]$args[++$i] }
    }
}
try {
    $output = Invoke-Expression $cmd 2>&1 | Out-String
    $exitCode = $LASTEXITCODE
    if ($null -eq $exitCode) { $exitCode = 0 }
} catch {
    $output = $_.Exception.Message
    $exitCode = 1
}
ctx_set "command_output" $output
ctx_set "command_exit_code" $exitCode
if ($exitCode -ne $expectExit) {
    $env:LAST_ERROR = "Command exited $exitCode (expected $expectExit)"
    exit 1
}
if ($expectOutput -and $output -notlike "*$expectOutput*") {
    $env:LAST_ERROR = "Output does not contain ''$expectOutput''"
    exit 1
}
exit 0',
'[{"key":"cmd","type":"string","description":"PowerShell command to execute"},{"key":"expect_output","type":"string","description":"Expected substring in output"},{"key":"expect_exit","type":"number","description":"Expected exit code (default 0)"}]',
'[{"key":"command_output","type":"string","description":"Command output"},{"key":"command_exit_code","type":"number","description":"Exit code"}]',
30, true, '{}', '["windows"]');

COMMIT;
