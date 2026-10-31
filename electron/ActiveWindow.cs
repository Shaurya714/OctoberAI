using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

class ActiveWindowHelper {
    [DllImport("user32.dll")]
    static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll")]
    static extern int GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll")]
    static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);

    [DllImport("user32.dll")]
    static extern IntPtr GetTopWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    static extern IntPtr GetShellWindow();

    const uint GW_HWNDNEXT = 2;

    static int currentProcessId = 0;

    static void Main(string[] args) {
        Console.OutputEncoding = Encoding.UTF8;
        try {
            currentProcessId = Process.GetCurrentProcess().Id;
        } catch {}

        bool watchMode = args.Length > 0 && args[0] == "watch";

        if (watchMode) {
            string lastOutput = "";
            while (true) {
                string current = GetActiveWindowJson();
                if (current != lastOutput) {
                    Console.WriteLine(current);
                    Console.Out.Flush();
                    lastOutput = current;
                }
                Thread.Sleep(800);
            }
        } else {
            Console.WriteLine(GetActiveWindowJson());
            Console.Out.Flush();
        }
    }

    static string GetActiveWindowJson() {
        IntPtr fg = GetForegroundWindow();
        IntPtr shell = GetShellWindow();

        string app = "";
        string title = "";

        // 1. Check foreground window first if valid, visible, and not October
        if (fg != IntPtr.Zero && IsWindowVisible(fg) && !IsIconic(fg) && fg != shell) {
            GetInfo(fg, out app, out title);
            if (!IsOctober(app, title) && !string.IsNullOrEmpty(app) && app != "Desktop Environment") {
                return FormatJson(app, title);
            }
        }

        // 2. If foreground is October or empty, walk top-level z-order to find the top user application
        IntPtr cur = GetTopWindow(IntPtr.Zero);
        int scanned = 0;
        while (cur != IntPtr.Zero && scanned < 50) {
            scanned++;
            if (IsWindowVisible(cur) && !IsIconic(cur) && cur != shell && cur != fg) {
                int len = GetWindowTextLength(cur);
                if (len > 0) {
                    GetInfo(cur, out app, out title);
                    if (!string.IsNullOrEmpty(app) && !IsOctober(app, title)) {
                        // Exclude background system utility windows
                        if (!IsSystemToolWindow(app, title)) {
                            return FormatJson(app, title);
                        }
                    }
                }
            }
            cur = GetWindow(cur, GW_HWNDNEXT);
        }

        return FormatJson("Desktop Environment", "");
    }

    static bool IsOctober(string app, string title) {
        string a = (app ?? "").ToLower();
        string t = (title ?? "").ToLower();
        return a.Contains("october") || a == "electron" || t.Contains("october");
    }

    static bool IsSystemToolWindow(string app, string title) {
        string a = (app ?? "").ToLower();
        string t = (title ?? "").ToLower();
        if (a == "explorer" && (t == "program manager" || t == "taskbar" || t == "" || t == "notification area")) {
            return true;
        }
        if (t == "windows input experience" || t == "settings" || t == "system settings") {
            return true;
        }
        return false;
    }

    static void GetInfo(IntPtr hwnd, out string appName, out string title) {
        appName = "Desktop Environment";
        StringBuilder sb = new StringBuilder(512);
        GetWindowText(hwnd, sb, 512);
        title = sb.ToString().Trim();

        uint pid = 0;
        GetWindowThreadProcessId(hwnd, out pid);
        if (pid > 0 && pid != currentProcessId) {
            try {
                using (Process p = Process.GetProcessById((int)pid)) {
                    string procName = p.ProcessName;

                    // Try to get clean friendly product description if available
                    string desc = null;
                    try {
                        if (p.MainModule != null && p.MainModule.FileVersionInfo != null) {
                            desc = p.MainModule.FileVersionInfo.FileDescription;
                        }
                    } catch {}

                    if (!string.IsNullOrEmpty(desc) && desc.Trim().Length > 1 && !desc.Equals(procName, StringComparison.OrdinalIgnoreCase)) {
                        appName = FormatFriendlyName(desc.Trim(), procName);
                    } else {
                        appName = FormatFriendlyName(procName, procName);
                    }
                }
            } catch {
                appName = "Desktop Environment";
            }
        }
    }

    static string FormatFriendlyName(string name, string fallbackProc) {
        string lower = (name ?? "").ToLower();
        if (lower.Contains("visual studio code") || lower == "code") return "Visual Studio Code";
        if (lower.Contains("opera")) return "Opera Browser";
        if (lower.Contains("chrome")) return "Google Chrome";
        if (lower.Contains("msedge") || lower.Contains("edge")) return "Microsoft Edge";
        if (lower.Contains("firefox")) return "Mozilla Firefox";
        if (lower.Contains("explorer") && lower.Contains("windows")) return "File Explorer";
        if (lower == "explorer") return "File Explorer";
        if (lower.Contains("terminal") || lower == "windowsterminal") return "Windows Terminal";
        if (lower == "notepad") return "Notepad";
        return name ?? fallbackProc ?? "Application";
    }

    static string FormatJson(string appName, string title) {
        title = (title ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", " ");
        appName = (appName ?? "Desktop Environment").Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", " ");
        return string.Format("{{\"appName\":\"{0}\",\"windowTitle\":\"{1}\"}}", appName, title);
    }
}
