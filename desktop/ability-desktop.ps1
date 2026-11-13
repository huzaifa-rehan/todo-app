<#
  Runs the Ability whiteboard as the desktop: a borderless window pinned just
  above the real desktop, backed by a local production server on 127.0.0.1.

    .\ability-desktop.ps1 install     build, add to Startup, and start
    .\ability-desktop.ps1 start       start now (the default)
    .\ability-desktop.ps1 stop        close the board and stop its server
    .\ability-desktop.ps1 build       rebuild after changing the app, then restart it
    .\ability-desktop.ps1 uninstall   stop and remove from Startup
    .\ability-desktop.ps1 status      show what is running

  Hotkeys:
    Ctrl+Alt+B        bring the board over your windows / send it back
    Ctrl+Alt+Shift+B  hide the board to reach desktop icons / show it again

  Windows does not deliver typing to anything placed behind the desktop icons, so
  the board is a normal window above them with holes cut where each icon sits: the
  real icons show through and take their own clicks, and everything else reaches
  the board. A tinted copy of your wallpaper is set as the real wallpaper and also
  drawn behind the board, so the holes don't show. `stop` restores your original.
#>
param(
  [ValidateSet('start', 'stop', 'build', 'install', 'uninstall', 'status')]
  [string]$Action = 'start'
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing, System.Windows.Forms

$Port = 3100
$Url = "http://localhost:$Port"
$DistDir = '.next-desktop'
$RepoDir = Split-Path -Parent $PSScriptRoot
$WebDir = Join-Path $RepoDir 'apps\web'
$DataDir = Join-Path $env:LOCALAPPDATA 'AbilityDesktop'
$EdgeProfile = Join-Path $DataDir 'edge-profile'
$LogFile = Join-Path $DataDir 'desktop.log'
$StartupLink = Join-Path ([Environment]::GetFolderPath('Startup')) 'Ability Desktop.lnk'
$WallpaperFile = Join-Path $DataDir 'desktop-wallpaper.png'
$PublicWallpaper = Join-Path $WebDir 'public\desktop-wallpaper.png'
$OriginalWallpaper = Join-Path $DataDir 'original-wallpaper.json'
$TintRgb = 15, 18, 30
$TintOpacity = 0.55
$MutexName = 'Local\AbilityDesktop.Host'
$QuitEventName = 'Local\AbilityDesktop.Quit'

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class AbilityDesk {
  delegate bool EnumProc(IntPtr hwnd, IntPtr lParam);
  delegate void WinEventProc(IntPtr hook, uint evt, IntPtr hwnd, int obj, int child, uint thread, uint time);

  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] struct MSG {
    public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public POINT pt;
  }

  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder name, int max);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] static extern IntPtr GetShellWindow();
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr hwnd, uint cmd);
  [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
  [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint msg, IntPtr w, IntPtr l, uint flags, uint ms, out IntPtr result);
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr hwnd, ref POINT p);
  [DllImport("user32.dll")] static extern int SetWindowRgn(IntPtr hwnd, IntPtr rgn, bool redraw);
  [DllImport("user32.dll")] static extern int GetWindowRgnBox(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint from, uint to, bool attach);
  [DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "SystemParametersInfoW")] static extern bool SetSystemParameter(uint action, uint param, string value, uint ini);
  [DllImport("gdi32.dll")] static extern IntPtr CreateRectRgn(int l, int t, int r, int b);
  [DllImport("gdi32.dll")] static extern int CombineRgn(IntPtr dest, IntPtr a, IntPtr b, int mode);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll")] static extern IntPtr VirtualAllocEx(IntPtr p, IntPtr addr, IntPtr size, uint type, uint protect);
  [DllImport("kernel32.dll")] static extern bool VirtualFreeEx(IntPtr p, IntPtr addr, IntPtr size, uint type);
  [DllImport("kernel32.dll")] static extern bool ReadProcessMemory(IntPtr p, IntPtr addr, out RECT buffer, IntPtr size, out IntPtr read);
  [DllImport("kernel32.dll")] static extern bool WriteProcessMemory(IntPtr p, IntPtr addr, ref RECT buffer, IntPtr size, out IntPtr written);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd, int cmd);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int w, int h, uint flags);
  [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] static extern IntPtr GetLong(IntPtr hwnd, int index);
  [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] static extern IntPtr SetLong(IntPtr hwnd, int index, IntPtr value);
  [DllImport("user32.dll")] static extern bool SystemParametersInfo(uint action, uint param, out RECT rect, uint ini);
  [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr hwnd, int id, uint mods, uint vk);
  [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr hwnd, int id);
  [DllImport("user32.dll")] static extern IntPtr SetTimer(IntPtr hwnd, IntPtr id, uint ms, IntPtr proc);
  [DllImport("user32.dll")] static extern bool KillTimer(IntPtr hwnd, IntPtr id);
  [DllImport("user32.dll")] static extern int GetMessage(out MSG msg, IntPtr hwnd, uint min, uint max);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr hwnd, uint msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint min, uint max, IntPtr module, WinEventProc proc, uint pid, uint thread, uint flags);
  [DllImport("user32.dll")] static extern bool UnhookWinEvent(IntPtr hook);

  static readonly IntPtr HWND_TOP = IntPtr.Zero;
  static readonly IntPtr HWND_BOTTOM = new IntPtr(1);
  const int GWL_STYLE = -16, GWL_EXSTYLE = -20, GWLP_HWNDPARENT = -8;
  const long WS_CAPTION = 0x00C00000, WS_THICKFRAME = 0x00040000, WS_SYSMENU = 0x00080000;
  const long WS_MINIMIZEBOX = 0x00020000, WS_MAXIMIZEBOX = 0x00010000;
  const long WS_EX_TOOLWINDOW = 0x00000080, WS_EX_APPWINDOW = 0x00040000, WS_EX_TOPMOST = 0x00000008;
  const uint GW_HWNDPREV = 3;
  const int FRAME_PX = 7, TITLE_BAR_PX = 30; // Measured from Edge at 100% scale.
  const uint SWP_NOSIZE = 0x1, SWP_NOMOVE = 0x2, SWP_NOACTIVATE = 0x10, SWP_FRAMECHANGED = 0x20;
  const int SW_HIDE = 0, SW_SHOWNOACTIVATE = 4, SW_SHOWNA = 8;
  const uint WM_TIMER = 0x0113, WM_HOTKEY = 0x0312, WM_CLOSE = 0x0010;
  const uint MOD_ALT = 1, MOD_CONTROL = 2, MOD_SHIFT = 4, MOD_NOREPEAT = 0x4000, VK_B = 0x42;
  const int HOTKEY_FRONT = 1, HOTKEY_HIDE = 2;

  static IntPtr board, owner;
  static string holeSignature = "";
  static uint boardPid;
  static bool front, hidden;
  static WinEventProc keepAlive;

  // The largest visible top-level window owned by the given processes.
  public static IntPtr FindAppWindow(int[] pids) {
    IntPtr best = IntPtr.Zero;
    long bestArea = 0;
    HashSet<uint> wanted = new HashSet<uint>();
    foreach (int p in pids) wanted.Add((uint)p);
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      uint pid;
      GetWindowThreadProcessId(h, out pid);
      if (!wanted.Contains(pid) || !IsWindowVisible(h)) return true;
      StringBuilder cls = new StringBuilder(64);
      GetClassName(h, cls, 64);
      if (cls.ToString() != "Chrome_WidgetWin_1") return true;
      RECT r;
      GetWindowRect(h, out r);
      long area = (long)(r.Right - r.Left) * (r.Bottom - r.Top);
      if (area > bestArea) { bestArea = area; best = h; }
      return true;
    }, IntPtr.Zero);
    return best;
  }

  // Coordinates and sizes below must be real screen pixels, whatever the display scale.
  public static void UseRealPixels() { SetProcessDPIAware(); }

  public static void SetWallpaper(string path) {
    if (!SetSystemParameter(20 /* SPI_SETDESKWALLPAPER */, 0, path, 3 /* save and broadcast */))
      throw new InvalidOperationException("Windows refused to set the wallpaper.");
  }

  static IntPtr FindIconList() {
    IntPtr found = IntPtr.Zero;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      IntPtr view = FindWindowEx(h, IntPtr.Zero, "SHELLDLL_DefView", null);
      if (view == IntPtr.Zero) return true;
      found = FindWindowEx(view, IntPtr.Zero, "SysListView32", null);
      return false;
    }, IntPtr.Zero);
    return found;
  }

  // Screen rectangles of the desktop icons. The list view only writes them into memory owned
  // by Explorer, so this borrows a small buffer there and copies each rectangle back.
  static List<RECT> IconRects() {
    List<RECT> rects = new List<RECT>();
    IntPtr list = FindIconList();
    if (list == IntPtr.Zero || !IsWindowVisible(list)) return rects;
    IntPtr result;
    if (SendMessageTimeout(list, 0x1004 /* LVM_GETITEMCOUNT */, IntPtr.Zero, IntPtr.Zero, 2, 200, out result) == IntPtr.Zero) return rects;
    int count = result.ToInt32();
    uint pid;
    GetWindowThreadProcessId(list, out pid);
    IntPtr process = OpenProcess(0x0008 | 0x0010 | 0x0020 /* VM operation, read, write */, false, pid);
    if (process == IntPtr.Zero) return rects;
    IntPtr size = new IntPtr(Marshal.SizeOf(typeof(RECT)));
    IntPtr buffer = VirtualAllocEx(process, IntPtr.Zero, size, 0x3000 /* commit, reserve */, 0x04 /* read/write */);
    try {
      if (buffer == IntPtr.Zero) return rects;
      POINT origin = new POINT();
      ClientToScreen(list, ref origin);
      for (int i = 0; i < count; i++) {
        RECT r = new RECT(); // Left = 0 asks for LVIR_BOUNDS, the icon and its label.
        IntPtr moved;
        if (!WriteProcessMemory(process, buffer, ref r, size, out moved)) break;
        if (SendMessageTimeout(list, 0x100E /* LVM_GETITEMRECT */, new IntPtr(i), buffer, 2, 200, out result) == IntPtr.Zero || result == IntPtr.Zero) continue;
        if (!ReadProcessMemory(process, buffer, out r, size, out moved)) break;
        r.Left += origin.X; r.Right += origin.X; r.Top += origin.Y; r.Bottom += origin.Y;
        rects.Add(r);
      }
    } finally {
      if (buffer != IntPtr.Zero) VirtualFreeEx(process, buffer, IntPtr.Zero, 0x8000 /* release */);
      CloseHandle(process);
    }
    return rects;
  }

  // Cuts a hole per icon. In front of other windows there are no holes, or those apps would show through.
  static void UpdateHoles() {
    RECT w;
    GetWindowRect(board, out w);
    List<RECT> icons = front ? new List<RECT>() : IconRects();
    StringBuilder sig = new StringBuilder();
    sig.Append(front).Append('|').Append(w.Left).Append(',').Append(w.Top).Append(',').Append(w.Right).Append(',').Append(w.Bottom);
    foreach (RECT r in icons) sig.Append('|').Append(r.Left).Append(',').Append(r.Top).Append(',').Append(r.Right).Append(',').Append(r.Bottom);
    RECT box;
    bool hasRegion = GetWindowRgnBox(board, out box) != 0;
    bool wantsRegion = !front;
    if (sig.ToString() == holeSignature && hasRegion == wantsRegion) return;
    holeSignature = sig.ToString();
    if (!wantsRegion) { SetWindowRgn(board, IntPtr.Zero, true); return; }
    IntPtr region = CreateRectRgn(0, 0, w.Right - w.Left, w.Bottom - w.Top);
    foreach (RECT r in icons) {
      IntPtr hole = CreateRectRgn(r.Left - w.Left, r.Top - w.Top, r.Right - w.Left, r.Bottom - w.Top);
      CombineRgn(region, region, hole, 4 /* RGN_DIFF */);
      DeleteObject(hole);
    }
    // On success Windows owns the region, so it is only freed if the call fails.
    if (SetWindowRgn(board, region, true) == 0) DeleteObject(region);
  }

  public static void Close(IntPtr hwnd) { PostMessage(hwnd, WM_CLOSE, IntPtr.Zero, IntPtr.Zero); }

  // Edge keeps drawing its title bar and frame even with the window styles removed,
  // so they are positioned just past the edges of the work area.
  static RECT Target() {
    RECT work;
    SystemParametersInfo(48 /* SPI_GETWORKAREA */, 0, out work, 0);
    uint dpi = GetDpiForWindow(board);
    int frame = (int)(FRAME_PX * dpi / 96);
    work.Left -= frame;
    work.Right += frame;
    work.Bottom += frame;
    work.Top -= (int)(TITLE_BAR_PX * dpi / 96);
    return work;
  }

  // Borderless, out of the taskbar and Alt+Tab, and owned by the shell so it stays above the desktop.
  static void ApplyChrome() {
    long style = GetLong(board, GWL_STYLE).ToInt64();
    long nextStyle = style & ~(WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX);
    if (nextStyle != style) SetLong(board, GWL_STYLE, new IntPtr(nextStyle));
    long ex = GetLong(board, GWL_EXSTYLE).ToInt64();
    long nextEx = (ex | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW;
    if (nextEx != ex) SetLong(board, GWL_EXSTYLE, new IntPtr(nextEx));
    IntPtr shell = GetShellWindow();
    if (shell != owner) { owner = shell; SetLong(board, GWLP_HWNDPARENT, shell); }
  }

  static void Place(IntPtr after, uint extra) {
    RECT t = Target();
    SetWindowPos(board, after, t.Left, t.Top, t.Right - t.Left, t.Bottom - t.Top, SWP_NOACTIVATE | extra);
  }

  // Directly above the desktop window: below every app, but not below the desktop itself.
  static void SendBack() {
    if (front) { front = false; UpdateHoles(); }
    IntPtr above = GetWindow(GetShellWindow(), GW_HWNDPREV);
    if (above == board) return;
    bool none = above == IntPtr.Zero || (GetLong(above, GWL_EXSTYLE).ToInt64() & WS_EX_TOPMOST) != 0;
    SetWindowPos(board, none ? HWND_BOTTOM : above, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
  }

  static void BringFront() {
    front = true;
    if (hidden) { hidden = false; ShowWindow(board, SW_SHOWNA); }
    UpdateHoles();
    // Windows only lets the current foreground thread hand over focus, so join its input queue briefly.
    uint unused;
    IntPtr current = GetForegroundWindow();
    uint foregroundThread = current == IntPtr.Zero ? 0 : GetWindowThreadProcessId(current, out unused);
    uint me = GetCurrentThreadId();
    bool attached = foregroundThread != 0 && foregroundThread != me && AttachThreadInput(me, foregroundThread, true);
    SetWindowPos(board, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE);
    SetForegroundWindow(board);
    if (attached) AttachThreadInput(me, foregroundThread, false);
  }

  static void OnForeground(IntPtr hook, uint evt, IntPtr hwnd, int obj, int child, uint thread, uint time) {
    if (hidden) return;
    if (hwnd == board) {
      // Clicking the board focuses it but must not lift it over other windows, like a real desktop.
      if (!front) SendBack();
      return;
    }
    if (!front) return;
    // Judge the window that is foreground now: this event can be stale, or Explorer's
    // brief ForegroundStaging window during a switch.
    IntPtr current = GetForegroundWindow();
    if (current == IntPtr.Zero || current == board) return;
    StringBuilder cls = new StringBuilder(32);
    GetClassName(current, cls, 32);
    if (cls.ToString() == "ForegroundStaging") return;
    uint pid;
    GetWindowThreadProcessId(current, out pid);
    // The board's own popups, such as delete confirmations, don't count as leaving it.
    if (pid != boardPid) SendBack();
  }

  // Returns "quit", "closed", "server-exited", or "display-changed".
  public static string Run(IntPtr hwnd, EventWaitHandle quit, System.Diagnostics.Process server, string wallpaper, out string warning) {
    board = hwnd;
    owner = IntPtr.Zero;
    front = false;
    hidden = false;
    holeSignature = "";
    GetWindowThreadProcessId(hwnd, out boardPid);
    warning = "";

    ShowWindow(board, SW_HIDE);
    ApplyChrome();
    Place(HWND_BOTTOM, SWP_FRAMECHANGED);
    UpdateHoles();
    ShowWindow(board, SW_SHOWNA);
    SendBack();

    if (!RegisterHotKey(IntPtr.Zero, HOTKEY_FRONT, MOD_CONTROL | MOD_ALT | MOD_NOREPEAT, VK_B))
      warning += "Ctrl+Alt+B is taken by another app. ";
    if (!RegisterHotKey(IntPtr.Zero, HOTKEY_HIDE, MOD_CONTROL | MOD_ALT | MOD_SHIFT | MOD_NOREPEAT, VK_B))
      warning += "Ctrl+Alt+Shift+B is taken by another app. ";
    keepAlive = OnForeground;
    IntPtr hook = SetWinEventHook(3, 3 /* EVENT_SYSTEM_FOREGROUND */, IntPtr.Zero, keepAlive, 0, 0, 0x2 /* OUTOFCONTEXT */);
    IntPtr timer = SetTimer(IntPtr.Zero, IntPtr.Zero, 1000, IntPtr.Zero);
    RECT startWork;
    SystemParametersInfo(48 /* SPI_GETWORKAREA */, 0, out startWork, 0);

    try {
      MSG msg;
      while (GetMessage(out msg, IntPtr.Zero, 0, 0) > 0) {
        if (msg.message == WM_HOTKEY) {
          int id = msg.wParam.ToInt32();
          if (id == HOTKEY_FRONT) {
            if (front) SendBack(); else BringFront();
          } else if (id == HOTKEY_HIDE) {
            if (hidden) { hidden = false; ShowWindow(board, SW_SHOWNA); SendBack(); }
            else { hidden = true; front = false; ShowWindow(board, SW_HIDE); }
          }
        } else if (msg.message == WM_TIMER) {
          if (quit.WaitOne(0)) return "quit";
          if (!IsWindow(board)) return "closed";
          if (server != null && server.HasExited) return "server-exited";
          // A moved taskbar, new resolution or newly picked wallpaper all change the board's background.
          RECT nowWork;
          SystemParametersInfo(48 /* SPI_GETWORKAREA */, 0, out nowWork, 0);
          if (nowWork.Left != startWork.Left || nowWork.Top != startWork.Top || nowWork.Right != startWork.Right || nowWork.Bottom != startWork.Bottom)
            return "display-changed";
          string nowWallpaper = Microsoft.Win32.Registry.GetValue(@"HKEY_CURRENT_USER\Control Panel\Desktop", "WallPaper", null) as string;
          if (nowWallpaper != null && !string.Equals(nowWallpaper, wallpaper, StringComparison.OrdinalIgnoreCase))
            return "display-changed";
          if (hidden) continue;
          if (IsIconic(board)) ShowWindow(board, SW_SHOWNOACTIVATE);
          ApplyChrome();
          if (!front) SendBack();
          RECT cur, want = Target();
          GetWindowRect(board, out cur);
          if (cur.Left != want.Left || cur.Top != want.Top || cur.Right != want.Right || cur.Bottom != want.Bottom)
            SetWindowPos(board, IntPtr.Zero, want.Left, want.Top, want.Right - want.Left, want.Bottom - want.Top, SWP_NOACTIVATE | 0x4 /* SWP_NOZORDER */);
          UpdateHoles();
        }
      }
      return "quit";
    } finally {
      KillTimer(IntPtr.Zero, timer);
      UnhookWinEvent(hook);
      UnregisterHotKey(IntPtr.Zero, HOTKEY_FRONT);
      UnregisterHotKey(IntPtr.Zero, HOTKEY_HIDE);
    }
  }
}
'@

[AbilityDesk]::UseRealPixels()

function Write-Log([string]$Message) {
  New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
  Add-Content -Path $LogFile -Value "$(Get-Date -Format s) $Message"
}

function Get-ServerProcess {
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $listener) { return $null }
  return Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
}

function Get-EdgeProcessIds {
  $needle = $EdgeProfile.ToLowerInvariant()
  Get-CimInstance Win32_Process -Filter "Name = 'msedge.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($needle) } |
    ForEach-Object { [int]$_.ProcessId }
}

function Set-ServerEnvironment {
  $env:NEXT_DIST_DIR = $DistDir
  # Sign-in callbacks must match this port, not the dev server's in .env. A value set here wins over .env.
  $env:BETTER_AUTH_URL = $Url
  $env:NEXT_PUBLIC_DESKTOP_MODE = '1'
}

function Invoke-Build {
  Set-ServerEnvironment
  $pnpm = (Get-Command pnpm.cmd -ErrorAction Stop).Source
  Push-Location $WebDir
  try {
    & $pnpm run build
    if ($LASTEXITCODE -ne 0) { throw "Build failed with exit code $LASTEXITCODE." }
  } finally {
    Pop-Location
  }
}

function Test-ServerReady {
  try {
    $request = [Net.WebRequest]::Create("$Url/sign-in")
    $request.Timeout = 3000
    $response = $request.GetResponse()
    $response.Close()
    return $true
  } catch {
    return $false
  }
}

function Start-BoardServer {
  $existing = Get-ServerProcess
  if ($existing) {
    if ($existing.ProcessName -ne 'node') { throw "Port $Port is in use by $($existing.ProcessName)." }
    return $existing
  }
  if (-not (Test-Path (Join-Path $WebDir "$DistDir\BUILD_ID"))) { Invoke-Build }

  Set-ServerEnvironment
  $node = (Get-Command node.exe -ErrorAction Stop).Source
  $next = Join-Path $WebDir 'node_modules\next\dist\bin\next'
  $process = Start-Process -FilePath $node -WorkingDirectory $WebDir -WindowStyle Hidden -PassThru `
    -ArgumentList @("`"$next`"", 'start', '-p', "$Port", '-H', '127.0.0.1') `
    -RedirectStandardOutput (Join-Path $DataDir 'server.out.log') `
    -RedirectStandardError (Join-Path $DataDir 'server.err.log')

  foreach ($attempt in 1..60) {
    if (Test-ServerReady) { return $process }
    if ($process.HasExited) { throw "Server exited with code $($process.ExitCode); see $DataDir\server.err.log." }
    Start-Sleep -Seconds 1
  }
  throw "Server did not become ready on port $Port."
}

# The app reads from a remote database, so at login wait briefly for the network.
function Wait-ForDatabaseNetwork {
  $envFile = Join-Path $RepoDir '.env'
  if (-not (Test-Path $envFile)) { return }
  $match = Select-String -Path $envFile -Pattern '^DATABASE_URL=.*@([^/:?]+)' | Select-Object -First 1
  if (-not $match) { return }
  $dbHost = $match.Matches[0].Groups[1].Value
  foreach ($attempt in 1..30) {
    $client = New-Object Net.Sockets.TcpClient
    try {
      $connect = $client.BeginConnect($dbHost, 5432, $null, $null)
      if ($connect.AsyncWaitHandle.WaitOne(2000) -and $client.Connected) { return }
    } catch {
      Write-Log "Database network not ready: $($_.Exception.GetType().Name)"
    } finally {
      $client.Close()
    }
    Start-Sleep -Seconds 2
  }
  Write-Log 'Database network still unreachable; opening the board anyway.'
}

function Get-WallpaperSettings {
  Get-ItemProperty -Path 'HKCU:\Control Panel\Desktop' | Select-Object Wallpaper, WallpaperStyle, TileWallpaper
}

# Draws the wallpaper at the screen's exact size so the board and desktop match pixel for pixel.
function New-TintedWallpaper([string]$Source, [int]$Width, [int]$Height) {
  $canvas = New-Object Drawing.Bitmap $Width, $Height
  $graphics = [Drawing.Graphics]::FromImage($canvas)
  try {
    $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.Clear([Drawing.Color]::Black)
    if ($Source -and (Test-Path -LiteralPath $Source)) {
      $image = [Drawing.Image]::FromFile($Source)
      try {
        $scale = [Math]::Max($Width / $image.Width, $Height / $image.Height)
        $drawWidth = $image.Width * $scale
        $drawHeight = $image.Height * $scale
        $graphics.DrawImage($image, [single](($Width - $drawWidth) / 2), [single](($Height - $drawHeight) / 2), [single]$drawWidth, [single]$drawHeight)
      } finally {
        $image.Dispose()
      }
    }
    $brush = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb([int](255 * $TintOpacity), $TintRgb[0], $TintRgb[1], $TintRgb[2]))
    $graphics.FillRectangle($brush, 0, 0, $Width, $Height)
    $brush.Dispose()
    $canvas.Save($WallpaperFile, [Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $canvas.Dispose()
  }
}

function Enable-TintedWallpaper {
  $current = Get-WallpaperSettings
  # If it's already ours, the file saved earlier still holds the real original.
  if ($current.Wallpaper -ne $WallpaperFile) { $current | ConvertTo-Json | Set-Content -LiteralPath $OriginalWallpaper -Encoding UTF8 }
  $original = Get-Content -LiteralPath $OriginalWallpaper -Raw | ConvertFrom-Json
  $screen = [Windows.Forms.Screen]::PrimaryScreen.Bounds
  New-TintedWallpaper $original.Wallpaper $screen.Width $screen.Height
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $PublicWallpaper) | Out-Null
  # The page starts at the usable screen area, not the screen corner, so its copy is cropped to match.
  $full = New-Object Drawing.Bitmap $WallpaperFile
  try {
    $crop = $full.Clone([Windows.Forms.Screen]::PrimaryScreen.WorkingArea, $full.PixelFormat)
    try { $crop.Save($PublicWallpaper, [Drawing.Imaging.ImageFormat]::Png) } finally { $crop.Dispose() }
  } finally {
    $full.Dispose()
  }
  Set-ItemProperty -Path 'HKCU:\Control Panel\Desktop' -Name WallpaperStyle -Value '10'
  Set-ItemProperty -Path 'HKCU:\Control Panel\Desktop' -Name TileWallpaper -Value '0'
  [AbilityDesk]::SetWallpaper($WallpaperFile)
}

# Only undoes our own change: a wallpaper you picked while the board ran is left alone.
function Restore-Wallpaper {
  if (-not (Test-Path -LiteralPath $OriginalWallpaper)) { return }
  if ((Get-WallpaperSettings).Wallpaper -ne $WallpaperFile) { return }
  $original = Get-Content -LiteralPath $OriginalWallpaper -Raw | ConvertFrom-Json
  Set-ItemProperty -Path 'HKCU:\Control Panel\Desktop' -Name WallpaperStyle -Value $original.WallpaperStyle
  Set-ItemProperty -Path 'HKCU:\Control Panel\Desktop' -Name TileWallpaper -Value $original.TileWallpaper
  [AbilityDesk]::SetWallpaper($original.Wallpaper)
}

function Open-BoardWindow {
  $edge = Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'
  $pids = @(Get-EdgeProcessIds)
  if ($pids.Count -gt 0) {
    $hwnd = [AbilityDesk]::FindAppWindow([int[]]$pids)
    if ($hwnd -ne [IntPtr]::Zero) { return $hwnd }
  }
  Start-Process -FilePath $edge -ArgumentList @(
    "--app=$Url",
    "--user-data-dir=`"$EdgeProfile`"",
    # With composited output, Windows paints the holes gray instead of showing what's behind them.
    '--disable-direct-composition',
    '--no-first-run',
    '--no-default-browser-check'
  ) | Out-Null
  foreach ($attempt in 1..30) {
    Start-Sleep -Seconds 1
    $pids = @(Get-EdgeProcessIds)
    if ($pids.Count -eq 0) { continue }
    $hwnd = [AbilityDesk]::FindAppWindow([int[]]$pids)
    if ($hwnd -ne [IntPtr]::Zero) { return $hwnd }
  }
  throw 'The board window did not appear.'
}

function Close-BoardWindow([IntPtr]$Hwnd) {
  [AbilityDesk]::Close($Hwnd)
  foreach ($attempt in 1..20) {
    if (@(Get-EdgeProcessIds).Count -eq 0) { return }
    Start-Sleep -Milliseconds 500
  }
}

function Start-Host {
  New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
  $createdNew = $false
  $mutex = New-Object Threading.Mutex($true, $MutexName, [ref]$createdNew)
  if (-not $createdNew) { Write-Output 'Ability Desktop is already running.'; return }
  $quit = New-Object Threading.EventWaitHandle($false, [Threading.EventResetMode]::ManualReset, $QuitEventName)
  $quit.Reset() | Out-Null

  $failures = 0
  $server = $null
  $hwnd = [IntPtr]::Zero
  try {
    Enable-TintedWallpaper
    Wait-ForDatabaseNetwork
    while ($true) {
      $started = Get-Date
      try {
        $server = Start-BoardServer
        $hwnd = Open-BoardWindow
        $warning = ''
        $reason = [AbilityDesk]::Run($hwnd, $quit, $server, $WallpaperFile, [ref]$warning)
        if ($warning) { Write-Log $warning }
        Write-Log "Run ended: $reason"
        if ($reason -eq 'quit') { break }
        if ($reason -eq 'display-changed') {
          Close-BoardWindow $hwnd
          Enable-TintedWallpaper
          continue
        }
      } catch {
        Write-Log "Error: $($_.Exception.Message)"
      }
      # Recover from a closed window or dead server, but don't spin if it keeps failing fast.
      if (((Get-Date) - $started).TotalSeconds -lt 30) { $failures++ } else { $failures = 0 }
      if ($failures -ge 5) { Write-Log 'Giving up after 5 quick failures.'; break }
      if ($quit.WaitOne(3000)) { break }
    }
  } finally {
    if ($hwnd -ne [IntPtr]::Zero) { [AbilityDesk]::Close($hwnd) }
    $listener = Get-ServerProcess
    if ($listener -and $listener.ProcessName -eq 'node') { Stop-Process -Id $listener.Id -Force }
    Restore-Wallpaper
    $quit.Dispose()
    $mutex.ReleaseMutex()
    $mutex.Dispose()
  }
}

function Stop-Host {
  $quit = $null
  if ([Threading.EventWaitHandle]::TryOpenExisting($QuitEventName, [ref]$quit)) {
    $quit.Set() | Out-Null
    $quit.Dispose()
    foreach ($attempt in 1..15) {
      Start-Sleep -Seconds 1
      $mutex = $null
      if (-not [Threading.Mutex]::TryOpenExisting($MutexName, [ref]$mutex)) { break }
      $mutex.Dispose()
    }
    Write-Output 'Stopped.'
  } else {
    Restore-Wallpaper
    Write-Output 'Not running.'
  }
}

function Start-Detached {
  Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "`"$PSCommandPath`"", 'start'
  ) | Out-Null
}

switch ($Action) {
  'start' { Start-Host }
  'stop' { Stop-Host }
  'build' {
    Stop-Host
    Invoke-Build
    Start-Detached
    Write-Output 'Rebuilt and restarted.'
  }
  'install' {
    New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
    if (-not (Test-Path (Join-Path $WebDir "$DistDir\BUILD_ID"))) { Invoke-Build }
    $shell = New-Object -ComObject WScript.Shell
    $link = $shell.CreateShortcut($StartupLink)
    $link.TargetPath = Join-Path $PSHOME 'powershell.exe'
    $link.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`" start"
    $link.WorkingDirectory = $PSScriptRoot
    $link.WindowStyle = 7
    $link.Save()
    Start-Detached
    Write-Output "Installed: $StartupLink"
  }
  'uninstall' {
    Stop-Host
    if (Test-Path $StartupLink) { Remove-Item -LiteralPath $StartupLink }
    Write-Output 'Removed from Startup. Sign-in data stays in the profile folder until you delete it:'
    Write-Output "  $DataDir"
  }
  'status' {
    $server = Get-ServerProcess
    Write-Output "Server on port ${Port}: $(if ($server) { "running (pid $($server.Id))" } else { 'stopped' })"
    Write-Output "Board window processes: $(@(Get-EdgeProcessIds).Count)"
    Write-Output "Starts at login: $(Test-Path $StartupLink)"
  }
}
