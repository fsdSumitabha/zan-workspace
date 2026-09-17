import { app, BrowserWindow, Menu } from "electron";
import fs from "fs";
import path from "path";

function createWindow() {
    const configPath = path.join(app.getPath("userData"), "window.json");
console.log(app.getPath("userData"));
    let bounds = {
        width: 840,
        height: 600
    };

    if (fs.existsSync(configPath)) {
        bounds = JSON.parse(fs.readFileSync(configPath, "utf8"));
    }

    const win = new BrowserWindow({
        ...bounds,
        autoHideMenuBar: true
    });

    win.on("close", () => {
        fs.writeFileSync(
            configPath,
            JSON.stringify(win.getBounds())
        );
    });

    win.loadURL("http://localhost:3000");
}

app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();
}); 