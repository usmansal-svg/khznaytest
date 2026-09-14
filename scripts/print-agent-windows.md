# Label printer helper on Windows (Zebra)

One Windows PC per station (or one PC with several Zebras) can run the helper.
It sends native ZPL to the Zebra, so no browser is involved.

## One-time setup on the PC

1. Install **Node.js 20 or newer** from nodejs.org (LTS, default options).
2. Install **Git for Windows**, then in PowerShell:
   ```
   cd C:\
   git clone https://github.com/<your-account>/khazanaytest.git khazanay
   cd C:\khazanay
   npm install
   ```
   (Or copy the project folder from the Mac. Keep it updated the same way it arrived.)
3. Copy `.env.local` from the Mac into `C:\khazanay\.env.local` (it holds the database key; never share it).
4. Plug in the Zebra, let Windows install the **ZDesigner ZD220** driver (from Zebra's site if it does not appear).
5. **Share the printer**: Settings → Printers → ZDesigner ZD220-203dpi ZPL → Printer properties → Sharing → *Share this printer*, share name `ZEBRA1`. In the same dialog, Advanced → Print processor: leave default; the helper sends raw ZPL and the driver passes it through.
6. Test the share once in PowerShell (a label should come out):
   ```
   "^XA^FO50,50^A0N,40,40^FDHello^FS^XZ" | Out-File -Encoding ascii C:\t.zpl; cmd /c copy /b C:\t.zpl \\localhost\ZEBRA1
   ```

## Running the helper

In PowerShell, from `C:\khazanay`:
```
$env:PRINTER_NAME="Station 1"; $env:PRINT_QUEUE="ZEBRA1"; $env:PRINT_MODE="zpl"; $env:PRINT_PAPER="label225x15"; npm run print-agent
```
Leave the window open. The iPad's print page lists "Station 1" within a few seconds.

## Starting it with Windows

Task Scheduler → Create Task → *Run whether user is logged on or not* → Trigger *At startup* → Action:
- Program: `C:\Program Files\nodejs\node.exe`
- Arguments: `--import tsx scripts/print-agent.mts`
- Start in: `C:\khazanay`
- On the *Actions* tab is no place for variables, so put them in the task's environment by creating a small `run-helper.cmd` in `C:\khazanay`:
  ```
  @echo off
  set PRINTER_NAME=Station 1
  set PRINT_QUEUE=ZEBRA1
  set PRINT_MODE=zpl
  set PRINT_PAPER=label225x15
  cd /d C:\khazanay
  node --import tsx scripts/print-agent.mts >> C:\khazanay\print-agent.log 2>&1
  ```
  and point the task at that `.cmd` instead.

Several Zebras on one PC: share each under its own name (`ZEBRA1`, `ZEBRA2`…) and make one `.cmd` and one task per printer with a different `PRINTER_NAME`.

Direct-thermal labels instead of a ribbon: add `set PRINT_RIBBON=no`.
