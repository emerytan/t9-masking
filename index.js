const { app, BrowserWindow, Menu } = require('electron')
const path = require('path')
const fs = require('fs').promises
const ipc = require('electron').ipcMain
const net = require('net')
const { execFile } = require('child_process')
const {
    StringDecoder
} = require('string_decoder')
const decoder = new StringDecoder('utf8')
const port = 23
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

function createApplicationMenu() {
    const menu = Menu.buildFromTemplate([
        {
            label: 'File',
            submenu: [
                {
                    label: 'Set CVM address...',
                    click: () => {
                        if (win) win.webContents.send('show connection dialog')
                    }
                },
                { type: 'separator' },
                { role: 'quit' }
            ]
        }
    ])
    Menu.setApplicationMenu(menu)
}

app.whenReady().then(() => {
    createApplicationMenu()
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        if (maskingMotors && !maskingMotors.destroyed) maskingMotors.end()

        setTimeout(() => {
            app.quit()
        }, 1000);
    }
})


ipc.on('view loaded', () => {
    console.log('ipc: view loaded');
    win.webContents.send('init view', 'T9 Masking Control version 0.0.3')
    connectSavedCvm()
})

ipc.on('connect to cvm', async (event, address) => {
    if (!isValidIpv4(address)) {
        event.sender.send('connection check result', {
            success: false,
            message: 'Enter CVM address.'
        })
        return
    }

    event.sender.send('connection status', `Checking ${address}...`)
    let pingSucceeded
    let portIsOpen
    try {
        ({ pingSucceeded, portIsOpen } = await checkCvmConnection(address))
    } catch (error) {
        event.sender.send('connection check result', {
            success: false,
            message: `Could not check the address: ${error.message}`
        })
        return
    }
    if (pingSucceeded && portIsOpen) {
        try {
            await saveCvmAddress(address)
        } catch (error) {
            event.sender.send('connection check result', {
                success: false,
                message: `The connection checks passed, but the address could not be saved: ${error.message}`
            })
            return
        }
    }

    const message = `Ping ${pingSucceeded ? 'succeeded' : 'failed'}; TCP port ${port} is ${portIsOpen ? 'open' : 'not open'}.${pingSucceeded && portIsOpen ? ' Address saved.' : ''}`

    event.sender.send('connection check result', {
        success: pingSucceeded && portIsOpen,
        address,
        pingSucceeded,
        portIsOpen,
        message
    })

    if (pingSucceeded && portIsOpen) connectMotors(address)
})

async function checkCvmConnection(address) {
    const [pingSucceeded, portIsOpen] = await Promise.all([
        pingHost(address),
        checkTcpPort(address, port)
    ])
    return { pingSucceeded, portIsOpen }
}

function getCvmConfigPath() {
    return path.join(app.getPath('userData'), 'cvm-config.json')
}

async function saveCvmAddress(address) {
    const configPath = getCvmConfigPath()
    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(configPath, JSON.stringify({ address }, null, 2), 'utf8')
}

async function connectSavedCvm() {
    const sender = win.webContents
    let config
    try {
        config = JSON.parse(await fs.readFile(getCvmConfigPath(), 'utf8'))
    } catch (error) {
        if (error.code === 'ENOENT') {
            sender.send('connection status', 'No saved CVM address. Select File > Set CVM address to configure one.')
            return
        }
        sender.send('connection status', `Could not read the saved CVM address: ${error.message}`)
        return
    }

    if (!config || !isValidIpv4(config.address)) {
        sender.send('connection status', 'The saved CVM address is invalid. Select File > Set CVM address to update it.')
        return
    }

    sender.send('saved cvm address', config.address)
    sender.send('connection status', `Checking saved CVM address ${config.address}...`)
    let pingSucceeded
    let portIsOpen
    try {
        ({ pingSucceeded, portIsOpen } = await checkCvmConnection(config.address))
    } catch (error) {
        sender.send('connection status', `Could not check the saved CVM address: ${error.message}`)
        return
    }
    if (!pingSucceeded || !portIsOpen) {
        sender.send('connection status', `Saved CVM address check failed: ping ${pingSucceeded ? 'succeeded' : 'failed'}, TCP port ${port} is ${portIsOpen ? 'open' : 'not open'}.`)
        return
    }

    connectMotors(config.address)
}

function isValidIpv4(address) {
    if (typeof address !== 'string') return false
    const octetPattern = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)'
    return new RegExp(`^${octetPattern}(?:\\.${octetPattern}){3}$`).test(address)
}

function pingHost(address) {
    return new Promise((resolve) => {
        const args = process.platform === 'win32'
            ? ['-n', '1', '-w', '2000', address]
            : ['-c', '1', address]
        execFile('ping', args, { timeout: 3000 }, (error) => {
            resolve(!error)
        })
    })
}

function checkTcpPort(address, targetPort) {
    return new Promise((resolve) => {
        const socket = net.createConnection({ host: address, port: targetPort })
        let settled = false
        const finish = (isOpen) => {
            if (settled) return
            settled = true
            socket.destroy()
            resolve(isOpen)
        }

        socket.setTimeout(2000)
        socket.once('connect', () => finish(true))
        socket.once('timeout', () => finish(false))
        socket.once('error', () => finish(false))
    })
}

function connectMotors(address) {
    if (maskingMotors && !maskingMotors.destroyed) maskingMotors.destroy()
    const socket = net.createConnection({
        host: address,
        port: port
    })
    maskingMotors = socket

    socket.on('connect', () => {
        win.webContents.send('connection status', `Connected to ${address}; initializing motors...`)
        setTimeout(() => {
            if (!socket.destroyed) socket.write(Buffer.from('t1\r\n'))
        }, 1000)
        setTimeout(() => {
            if (!socket.destroyed) socket.write(Buffer.from('password\r\n'))
        }, 2000)
        setTimeout(() => {
            if (!socket.destroyed) {
                socket.write(Buffer.from('#1.1.2.MOTOR.POSITION=?\r\n'))
                win.webContents.send('activate buttons', false)
                win.webContents.send('connection status', `Connected to ${address}.`)
            }
        }, 4000)
    })

    socket.on('data', (data) => {
        console.log(decoder.write(data.subarray(0, -2)))
        win.webContents.send('server messages', decoder.write(data.subarray(0, -2)))
    })

    socket.on('close', () => {
        console.log('masking motor connection closed')
        // win.webContents.send('activate buttons', false)
    })

    socket.on('end', () => {
        console.log('masking motor connection ended')
        // win.webContents.send('activate buttons', false)
    })

    socket.on('error', (err) => {
        console.log(err)
        win.webContents.send('connection status', `Connection error: ${err.message}`)
        win.webContents.send('activate buttons', true)
        // win.webContents.send('activate buttons', false)
    })

}

ipc.on('masking loaded', () => {
    // console.log(win.getChildWindows())
    win.webContents.send('appMessages', "Danny is the boss.")
})

ipc.on('masking command', (event, msg) => {
    console.log(`masking motor command: ${msg.command}`)
    if (!maskingMotors || maskingMotors.destroyed || !maskingMotors.writable) {
        event.sender.send('connection status', 'Not connected to the CVM masking system.')
        return
    }
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