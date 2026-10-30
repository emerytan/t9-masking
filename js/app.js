const ipc = require('electron').ipcRenderer
const appState = document.getElementById('appState')
const maskingTitle = document.getElementById('maskingTitle')
const serverMessages = document.getElementById('serverMessages')
const buttons = document.getElementsByClassName('eta-button')
const connectionDialog = document.getElementById('connectionDialog')
const connectionForm = document.getElementById('connectionForm')
const cvmAddress = document.getElementById('cvmAddress')
const connectionFeedback = document.getElementById('connectionFeedback')
const submitConnection = document.getElementById('submitConnection')

window.onload = function () {
    activateButtons(buttons, true)
    ipc.send('view loaded')
}

ipc.on('init view', (event, msg) => {
    maskingTitle.innerText = msg
})

ipc.on('server messages', (event, msg) => {
    serverMessages.innerText = msg
})

ipc.on('activate buttons', (event, msg) => {
    activateButtons(buttons, msg)
})

ipc.on('show connection dialog', () => {
    connectionFeedback.innerText = ''
    connectionDialog.hidden = false
    cvmAddress.focus()
})

ipc.on('saved cvm address', (event, address) => {
    cvmAddress.value = address
})

ipc.on('connection check result', (event, result) => {
    connectionFeedback.innerText = result.message
    appState.innerText = result.message
    submitConnection.disabled = false
    if (result.success) connectionDialog.hidden = true
})

ipc.on('connection status', (event, message) => {
    appState.innerText = message
})

connectionForm.addEventListener('submit', (event) => {
    event.preventDefault()
    submitConnection.disabled = true
    connectionFeedback.innerText = 'Checking address, ping, and TCP port 23...'
    ipc.send('connect to cvm', cvmAddress.value.trim())
})

document.getElementById('cancelConnection').addEventListener('click', () => {
    connectionDialog.hidden = true
})

document.addEventListener('click', function (event) {
    if (event.target.matches('.btn')) {
        appState.innerText = event.target.id
        ipc.send('masking command', {
            command: event.target.id
        })
    }
})

function activateButtons(elements, action) {
    let t
    let i = 0
    while (t = elements[i++]) {
        t.disabled = action
    }
}