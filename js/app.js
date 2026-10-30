const ipc = require('electron').ipcRenderer
const appState = document.getElementById('appState')
const maskingTitle = document.getElementById('maskingTitle')
const serverMessages = document.getElementById('serverMessages')
const buttons = document.getElementsByTagName('button')

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