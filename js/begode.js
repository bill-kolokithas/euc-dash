const debug = new URL(window.location.href).searchParams.get('debug')
const Decoder = new TextDecoder()
const maxCellVolt = 4.2
const baseCellSeries = 16
const framePacketLength = 24
const bluetoothPacketLength = 20

function modelParams() {
  switch(wheelModel) {
    case 'Mten3':       return { 'voltMultiplier': 1.25, 'minCellVolt': 3.3 }
    case 'MCM5':        return { 'voltMultiplier': 1.25, 'minCellVolt': 3.3 }
    case 'T3':          return { 'voltMultiplier': 1.25, 'minCellVolt': 3.25 }
    case 'Msuper Pro':  return { 'voltMultiplier': 1.50, 'minCellVolt': 3.25 }
    case 'MSP C30':     return { 'voltMultiplier': 1.50, 'minCellVolt': 3.25 }
    case 'MSP C38':     return { 'voltMultiplier': 1.50, 'minCellVolt': 3.25 }
    case 'RS C30':      return { 'voltMultiplier': 1.50, 'minCellVolt': 3.25 }
    case 'RS C38':      return { 'voltMultiplier': 1.50, 'minCellVolt': 3.25 }
    case 'EX':          return { 'voltMultiplier': 1.50, 'minCellVolt': 3.25 }
    case 'Monster':     return { 'voltMultiplier': 1.50, 'minCellVolt': 3.25 }
    case 'HERO':        return { 'voltMultiplier': 1.50, 'minCellVolt': 3.1 }
    case 'Nikola':      return { 'voltMultiplier': 1.50, 'minCellVolt': 3.0 }
    case 'EXN C30':     return { 'voltMultiplier': 1.50, 'minCellVolt': 3.0 }
    case 'EXN C38':     return { 'voltMultiplier': 1.50, 'minCellVolt': 3.0 }
    case 'EX20S C30':   return { 'voltMultiplier': 1.50, 'minCellVolt': 3.0 }
    case 'EX20S C38':   return { 'voltMultiplier': 1.50, 'minCellVolt': 3.0 }
    case 'Monster Pro': return { 'voltMultiplier': 1.50, 'minCellVolt': 3.0 }
    case 'Master':      return { 'voltMultiplier': 2,    'minCellVolt': 3.05 }
    default:            return { 'voltMultiplier': 1,    'minCellVolt': 3.3 }
  }
}

function commands(cmd, param) {
  switch(cmd) {
    case 'mainPacket':      return [44]
    case 'extendedPacket':  return [107]
    case 'fetchModel':      return [78]
    case 'fetchFirmware':   return [86]
    case 'beep':            return [98]
    case 'lightsOn':        return [81]
    case 'lightsOff':       return [69]
    case 'lightsStrobe':    return [84]
    case 'alertsOne':       return [111]
    case 'alertsTwo':       return [117]
    case 'alertsOff':       return [105]
    case 'alertsTiltback':  return [73]
    case 'pedalSoft':       return [115]
    case 'pedalMedium':     return [102]
    case 'pedalHard':       return [104]
    case 'rollAngleLow':    return [62]
    case 'rollAngleMedium': return [61]
    case 'rollAngleHigh':   return [60]
    case 'speedKilometers': return [103]
    case 'speedMiles':      return [109]
    case 'calibrate':       return [99, 121]
    case 'startIAP':        return [33, 64]
    case 'tiltbackOff':     return [34]
    case 'tiltbackSpeed':   return [87, 89, param / 10 + 48, param % 10 + 48]
    case 'pwmLimit':        return [87, 80, param / 10 + 48, param % 10 + 48]
    case 'volume':          return [87, 66, 48 + param]
    case 'ledMode':         return [87, 77, 48 + param]
    default:                return cmd
  }
}

const faultAlarms = {
  0: 'high power',
  1: 'high speed 2',
  2: 'high speed 1',
  3: 'low voltage',
  4: 'over voltage',
  5: 'high temperature',
  6: 'hall sensor error',
  7: 'transport mode'
}

async function sendCommand(cmd, param) {
  command = commands(cmd, param)

  logs += '> ' + command + '\n'

  for (let byte of command) {
    await characteristic.writeValue(new Uint8Array([byte]))
    await new Promise(r => setTimeout(r, 100))
  }
}

async function scan() {
  device = await navigator.bluetooth.requestDevice({ filters: [ { services: [0xFFE0] } ] })
  server = await device.gatt.connect()
  service = await server.getPrimaryService(0xFFE0)
  characteristic = await service.getCharacteristic(0xFFE1)
  await characteristic.startNotifications()
  characteristic.addEventListener('characteristicvaluechanged', readMainPackets)
  initialize()
}

async function initialize() {
  pwmAlarmSpeed = 0
  rendered = false
  wheelModel = ''
  firmware = ''
  updateTiltbackSpeed = true
  updatePwmLimit = true
  logs = ''
  frame = new Uint8Array(framePacketLength)
  previousFrame = new Uint8Array(framePacketLength)
  previousFrameLength = 0
  document.getElementById('scan-disconnect').innerText = 'Disconnect'
  document.getElementById('scan-disconnect').className = 'btn-lg btn-danger'
  document.getElementById('scan-disconnect').onclick = disconnect
  document.getElementById('packet-switch').classList.remove('invisible')
  document.getElementById('save-logs').classList.remove('invisible')
  updateVoltageHelpText()

  await sendCommand('fetchModel')
}

function disconnect() {
  device.gatt.disconnect()
  document.getElementById('scan-disconnect').innerText = 'Scan & Connect'
  document.getElementById('scan-disconnect').className = 'btn-lg btn-primary'
  document.getElementById('scan-disconnect').onclick = scan
  document.getElementById('packet-switch').classList.add('invisible')
  document.getElementById('save-logs').classList.add('invisible')
}

function saveLogs() {
  anchor = document.getElementById('save-logs')
  file = new Blob([logs], { type: 'text/plain' })
  anchor.href = URL.createObjectURL(file)
  filename = 'euc-dash-logs'
  if (wheelModel)
    filename += '-' + wheelModel
  if (firmware)
    filename += '-' + firmware

  anchor.download = filename + '.txt'
}

async function startIAP() {
  await sendCommand('startIAP')
  characteristic.removeEventListener('characteristicvaluechanged', readMainPackets)
  characteristic.addEventListener('characteristicvaluechanged',
    (data) => console.log(Decoder.decode(data.target.value)))
}

async function startYmodem() {
  await sendCommand([1])
}

async function exitYmodem() {
  await sendCommand([1, 0, 255, 65, 0, 1, 0].concat(Array(13).fill(0)))

  for (i = 0; i < 5; i++)
    await sendCommand(Array(bluetoothPacketLength).fill(0))

  await sendCommand(Array(11).fill(0).concat([19, 77]))
}

async function setTiltbackSpeed(speed) {
  updateTiltbackSpeed = true
  speed = parseInt(speed)

  if (speed == 0 || speed == 100)
    await sendCommand('tiltbackOff')
  else
    await sendCommand('tiltbackSpeed', speed)
}

async function setPwmLimit(pwmLimit) {
  updatePwmLimit = true
  pwmLimit = parseInt(pwmLimit)
  await sendCommand('pwmLimit', pwmLimit)
}
function setField(field, value) {
  document.getElementById(field).value = value
}

async function setWheelModel(data) {
  wheelModel = Decoder.decode(data.buffer.slice(5)).trim()
  setField('wheel-model', wheelModel)
  updateVoltageHelpText()

  await sendCommand('fetchFirmware')
}

function setFirmware(data) {
  firmware = Decoder.decode(data.buffer.slice(2))
  setField('firmware', firmware)

  // Master latest firmware
  if (firmware == '2014003') {
    showPwmLimitSetting()
    document.getElementById('remaining-distance-field').style.display = null
  }
}

function showPwmLimitSetting() {
  document.getElementById('pwm-limit').value = 80
  document.getElementById('pwm-limit-label').innerHTML = 80
  document.getElementById('pwm-limit-slider').style.display = null
}

async function switchToMainPackets() {
  characteristic.removeEventListener('characteristicvaluechanged', readExtendedPackets)
  document.getElementById('extended').style.display = 'none'
  document.getElementById('main').style.display = null
  document.getElementById('packet-switch').innerText = 'Extended packets ->'
  document.getElementById('packet-switch').onclick = switchToExtendedPackets
  await sendCommand('mainPacket')
  characteristic.addEventListener('characteristicvaluechanged', readMainPackets)
}

async function switchToExtendedPackets() {
  characteristic.removeEventListener('characteristicvaluechanged', readMainPackets)
  document.getElementById('main').style.display = 'none'
  document.getElementById('extended').style.display = null
  document.getElementById('packet-switch').innerText = '<- Main packets'
  document.getElementById('packet-switch').onclick = switchToMainPackets
  line = ''
  setupGauge()
  await sendCommand('extendedPacket')
  characteristic.addEventListener('characteristicvaluechanged', readExtendedPackets)
}

function updatePwmAlarmSpeed() {
  pwmAlarmSpeed = speed
  setField('pwm-alarm-speed', pwmAlarmSpeed)

  speedReduction = 1 - (100 - battery) / 450
  alarmSpeed100 = (speed / speedReduction).toFixed(1)
  setField('pwm-alarm-100', alarmSpeed100)

  alarmSpeeds = [10, 20, 30, 40, 50, 60, 70, 80, 90].forEach(batt => {
    speedReduction = 1 - (100 - batt) / 450
    setField(`pwm-alarm-${batt}`, (alarmSpeed100 * speedReduction).toFixed(1))
  })
}

function updateVoltageHelpText() {
  minVoltage = (modelParams()['voltMultiplier'] * modelParams()['minCellVolt'] * 16).toFixed(1)
  maxVoltage = (modelParams()['voltMultiplier'] * maxCellVolt * 16).toFixed(1)

  document.getElementById('voltage-help').innerText = `min: ${minVoltage}v - max: ${maxVoltage}v`
}

function parseFramePacket0(data) {
  voltage = data.getUint16(2) / 100
  scaledVoltage = (voltage * modelParams()['voltMultiplier']).toFixed(1)
  setField('voltage', scaledVoltage)

  battery = (100 * (voltage / baseCellSeries - modelParams()['minCellVolt']) /
   (maxCellVolt - modelParams()['minCellVolt'])).toFixed(2)
  setField('battery', battery)

  speed = Math.abs(data.getInt16(4) * 3.6 / 100).toFixed(1)
  setField('speed', speed)

  // Master latest firmware
  if (firmware == '2014003') {
    remainingDistance = data.getUint16(6)
    setField('remaining-distance', remainingDistance)
  }

  tripDistance = (data.getUint16(8) / 1000).toFixed(2)
  setField('trip-distance', tripDistance)

  phaseCurrent = data.getInt16(10) / 100
  setField('phase-current', phaseCurrent)

  // MPU6050 format
  temp = (data.getInt16(12) / 340 + 36.53).toFixed(2)
  setField('temp', temp)

  resets = data.getUint16(14)
  if (resets > 10)
    resets -= 9
  setField('resets', resets)

  volume = data.getUint16(16)
  if (volume >= 1 && volume <= 9)
    document.getElementById(`volume-${volume}`).checked = true
}

function parseFramePacket4(data) {
  totalDistance = (data.getUint32(2) / 1000).toFixed(2)
  setField('total-distance', totalDistance)

  modes = data.getUint16(6)
  pedalMode      = modes >> 13 & 0x3
  speedAlertMode = modes >> 10 & 0x3
  rollAngleMode  = modes >>  7 & 0x3
  speedUnitMode  = modes & 0x1

  document.getElementById(`pedal-mode-${pedalMode}`).checked = true
  document.getElementById(`speed-alert-${speedAlertMode}`).checked = true
  document.getElementById(`roll-angle-${rollAngleMode}`).checked = true
  document.getElementById(`speed-unit-${speedUnitMode}`).checked = true

  powerOffTime = data.getUint16(8)
  powerOffMinutes = Math.floor(powerOffTime / 60)
  powerOffSeconds = powerOffTime - (powerOffMinutes * 60)
  setField('poweroff-timer', `${powerOffMinutes}:${powerOffSeconds}`)

  tiltbackSpeed = data.getUint16(10)
  if (updateTiltbackSpeed) {
    document.getElementById('tiltback-speed-label').innerHTML = tiltbackSpeed >= 100 ? 'Disabled' : tiltbackSpeed
    document.getElementById('tiltback-speed').value = tiltbackSpeed
  }

  ledMode = data.getUint16(12)
  document.getElementById(`led-mode-${ledMode}`).checked = true

  faultAlarm = data.getUint8(12)
  faultAlarmLine = ''
  for (let bit = 0; bit < 8; bit++) {
    if (faultAlarm >> bit & 0x1)
      faultAlarmLine += faultAlarms[bit] + ', '
  }

  faultAlarmLine = faultAlarmLine.slice(0, -2)
  setField('fault-alarms', faultAlarmLine)

  if (faultAlarm & 0x1 && (pwmAlarmSpeed == 0 || speed < pwmAlarmSpeed))
    updatePwmAlarmSpeed()

  lightMode = data.getUint8(15)
  document.getElementById(`light-mode-${lightMode}`).checked = true
}

function parseFramePacket1(data) {
  pwmLimit = data.getUint16(2)
  if (updatePwmLimit) {
    document.getElementById('pwm-limit-label').innerHTML = pwmLimit
    document.getElementById('pwm-limit').value = pwmLimit
  }
}

function readMainPackets(event) {
  data = event.target.value
  array = new Uint8Array(data.buffer)

  if (debug)
    logs += array + '\n'

  frameStart = array.findIndex((el, idx, arr) => {
    return arr[idx] == 85 && arr[idx + 1] == 170
  })
  frameEnd = array.findIndex((el, idx, arr) => {
    return arr[idx] == 90 && arr[idx + 1] == 90 && arr[idx + 2] == 90 && arr[idx + 3] == 90
  })

  if (frameStart == -1 && frameEnd == -1) {
    if (!debug)
      logs += array + '\n'

    return handleRegularData(data)
  }

  if (frameEnd != -1) {
    frameLength = frameEnd + 4
    frame.set(previousFrame)
    frame.set(array.slice(0, frameLength), previousFrameLength)

    if (!debug)
      logs += frame + '\n'

    if (previousFrameLength + frameLength == framePacketLength)
      handleFrameData(new DataView(frame.buffer))
  }

  if (frameStart != -1) {
    previousFrame.set(array.slice(frameStart))
    previousFrameLength = bluetoothPacketLength - frameStart
  }
}

function handleRegularData(data) {
  if (data.getUint32(0) == 0x4E414D45)
    setWheelModel(data)
  else if (data.getInt16(0) == 0x4757)
    setFirmware(data)
}

function handleFrameData(data) {
  switch(data.getUint8(18)) {
    case 0: return parseFramePacket0(data)
    case 1: return parseFramePacket1(data)
    case 4: return parseFramePacket4(data)
  }
}

function appendElement(key, value) {
  return `
  <div class="mb-2 row">
    <label class="col-lg-5 col-form-label" for="${key}">${key}:</label>
    <div class="col-lg-7">
      <input class="form-control" id="${key}" type="text" value="${value}" disabled readonly>
    </div>
  </div>
  `
}

function readExtendedPackets(event) {
  if (debug)
    logs += new Uint8Array(event.target.value.buffer) + '\n'

  fragment = Decoder.decode(event.target.value)
  lineEnd = fragment.indexOf('\n')

  if (lineEnd == -1)
    line += fragment
  else {
    line += fragment.slice(0, lineEnd);

    if (!debug)
      logs += line.replace('\r', '\n')

    keys = line.match(/[A-z/=]+/g)
    keys = keys.map(l => l.split('=')[0])
    values = line.match(/-?\d+/g)

    pwmIndex = keys.indexOf('PWM')
    if (pwmIndex == -1)
      pwmIndex = keys.indexOf('pwmmmm')

    if (pwmIndex != -1) {
      pwm = Math.abs(values[pwmIndex] / 100).toFixed(1)
      gauge.set(pwm)
    }

    tempIndex = keys.indexOf('Tem')
    if (tempIndex != -1)
      values[tempIndex] = (values[tempIndex] / 333.87 + 21.0).toFixed(2) // MPU6500 format

    if (rendered) {
      try { keys.forEach((key, i) => setField(key, values[i])) }
      catch { rendered = false }
    }
    else {
      html = ''
      keys.forEach((key, i) => html += appendElement(key, values[i]))
      document.getElementById('extended-data').innerHTML = html
      rendered = true
    }

    line = fragment.slice(lineEnd + 1)
  }
}
