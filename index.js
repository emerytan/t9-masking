const { app, BrowserWindow, webContents } = require('electron')
const path = require('path')
const ipc = require('electron').ipcMain
const net = require('net')
const {
    StringDecoder
} = require('string_decoder')
const decoder = new StringDecoder('utf8')
const host = '10.208.79.162'
const port = '23'
let win = null
let maskingMotors = null


if (handleSquirrelEvent(app)) {
    return
}

function createWindow() {
    win = new BrowserWindow({
        width: 800,
        height: 350,
        webPreferences: {
            contextIsolation: false,
            nodeIntegration: true
        }
    })
    win.loadFile('index.html')
    // win.webContents.openDevTools()
}


app.whenReady().then(() => {
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        maskingMotors.end()

        setTimeout(() => {
            app.quit()
        }, 1000);
    }
})


ipc.on('view loaded', () => {
    console.log('ipc: view loaded');
    win.webContents.send('init view', 'T9 Masking Control version 0.0.2')
    connectMotors()
})



function connectMotors() {
    maskingMotors = net.createConnection({
        host: host,
        port: port
    }, (socket) => {
        console.log('created connection')
    })

    maskingMotors.on('connect', () => {
        setTimeout(() => {
            maskingMotors.write(Buffer.from('t1\r\n'))
        }, 1000)
        setTimeout(() => {
            maskingMotors.write(Buffer.from('password\r\n'))
        }, 2000)
        setTimeout(() => {
            maskingMotors.write(Buffer.from('#1.1.2.MOTOR.POSITION=?\r\n'))
            win.webContents.send('activate buttons', false)
        }, 4000)
    })

    maskingMotors.on('data', (data) => {
        console.log(decoder.write(data.subarray(0, -2)))
        win.webContents.send('server messages', decoder.write(data.subarray(0, -2)))
    })

    maskingMotors.on('close', () => {
        console.log('masking motor connection closed')
        // win.webContents.send('activate buttons', false)
    })

    maskingMotors.on('end', () => {
        console.log('masking motor connection ended')
        // win.webContents.send('activate buttons', false)
    })

    maskingMotors.on('error', (err) => {
        console.log(err)
        // win.webContents.send('activate buttons', false)
    })

}

ipc.on('masking loaded', () => {
    // console.log(win.getChildWindows())
    win.webContents.send('appMessages', "Danny is the boss.")
})

ipc.on('masking command', (event, msg) => {
    console.log(`masking motor command: ${msg.command}`)
    switch (msg.command) {
        case 'maskingScope':
            maskingMotors.write('#1.1.0.MOTOR=RECALL,1\r\n')
            break;
        case 'maskingFlat':
            maskingMotors.write('#1.1.0.MOTOR=RECALL,2\r\n')
            break;
        case 'leftClose':
            maskingMotors.write('#1.1.3.MOTOR=UP\r\n')
            break;
        case 'leftOpen':
            maskingMotors.write('#1.1.3.MOTOR=DOWN\r\n')
            break;
        case 'rightClose':
            maskingMotors.write('#1.1.4.MOTOR=UP\r\n')
            break;
        case 'rightOpen':
            maskingMotors.write('#1.1.4.MOTOR=DOWN\r\n')
            break;
        case 'bottomRaise':
            maskingMotors.write('#1.1.2.MOTOR=UP\r\n')
            break;
        case 'bottomLower':
            maskingMotors.write('#1.1.2.MOTOR=DOWN\r\n')
            break;
        default:
            console.log('unrecognized command')
            break;
    }
})


ipc.on('close app', () => {
    app.quit()
})


function handleSquirrelEvent(application) {
    if (process.argv.length === 1) {
        return false;
    }

    const ChildProcess = require('child_process');
    const appFolder = path.resolve(process.execPath, '..');
    const rootAtomFolder = path.resolve(appFolder, '..');
    const updateDotExe = path.resolve(path.join(rootAtomFolder, 'Update.exe'));
    const exeName = path.basename(process.execPath);
    const spawn = function (command, args) {
        let spawnedProcess, error;

        try {
            spawnedProcess = ChildProcess.spawn(command, args, {
                detached: true
            });
        } catch (error) { }
        return spawnedProcess;
    };

    const spawnUpdate = function (args) {
        return spawn(updateDotExe, args);
    };

    const squirrelEvent = process.argv[1];
    switch (squirrelEvent) {
        case '--squirrel-install':
        case '--squirrel-updated':
            spawnUpdate(['--createShortcut', exeName]);
            setTimeout(application.quit, 1000);
            return true;
        case '--squirrel-uninstall':
            spawnUpdate(['--removeShortcut', exeName]);
            setTimeout(application.quit, 1000);
            return true;
        case '--squirrel-obsolete':
            application.quit();
            return true;
    }
}

/*
motor 3 = left side 
up = to the left
down = to the right

motor 4 = right side 
up = to the left 
down = to the right 
*/