const Decoder = new TextDecoder()
const maxCellVolt = 4.2
const baseCellSeries = 16

function modelParams() {
  switch(wheelModel) {
    case 'Mten3':       return { 'voltMultiplier': 1.25, 'minCellVolt': 3.3 }
    case 'MCM5':        return { 'voltMultiplier': 1.25, 'minCellVolt': 3.3 }
    case 'T3':          return { 'voltMultiplier': 1.25, 'minCellVolt': 3.25 }
    case 'Nikola':      return { 'voltMultiplier': 1.50, 'minCellVolt': 3.25 }
    case 'MSP C30':     return { 'voltMultiplier': 1.50, 'minCellVolt': 3.25 }
    case 'MSP C38':     return { 'voltMultiplier': 1.50, 'minCellVolt': 3.25 }
    case 'RS C30':      return { 'voltMultiplier': 1.50, 'minCellVolt': 3.25 }
    case 'RS C38':      return { 'voltMultiplier': 1.50, 'minCellVolt': 3.25 }
    case 'EX':          return { 'voltMultiplier': 1.50, 'minCellVolt': 3.25 }
    case 'EX 20S':      return { 'voltMultiplier': 1.50, 'minCellVolt': 3.25 }
    case 'Monster':     return { 'voltMultiplier': 1.50, 'minCellVolt': 3.25 }
    case 'EXN':         return { 'voltMultiplier': 1.50, 'minCellVolt': 3.15 }
    case 'Monster Pro': return { 'voltMultiplier': 1.50, 'minCellVolt': 3.1 }
    case 'Master':      return { 'voltMultiplier': 2,    'minCellVolt': 3.25 }
    default:            return { 'voltMultiplier': 1,    'minCellVolt': 3.3 }
  }
}

function commands(cmd, param) {
  switch(cmd) {
    case 'mainPacket':      return [44]
    case 'extendedPacket':  return [107]
    case 'fetchModel':      return [78]
    case 'fetchModelCode':  return [86]
    case 'fetchGreet':      return [103]
    case 'lightsOn':        return [81]
    case 'lightsOff':       return [69]
    case 'lightsStrobe':    return [84]
    case 'alertsOne':       return [111]
    case 'alarmsTwo':       return [117]
    case 'alarmsOff':       return [105]
    case 'alarmsSport':     return [73]
    case 'pedalSoft':       return [115]
    case 'pedalMedium':     return [102]
    case 'pedalHard':       return [104]
    case 'tiltAngleLow':    return [60]
    case 'tiltAngleMedium': return [61]
    case 'tiltAngleHigh':   return [62]
    case 'beep':            return [98]
    case 'calibrate':       return [99, 121]
    case 'enterYmodem':     return [33, 64]
    case 'tiltbackOff':     return [34]
    case 'tiltbackSpeed':   return [87, 89, param / 10 + 48, param % 10 + 48]
    case 'volume':          return [87, 66, 48 + param]
    case 'ledMode':         return [87, 77, 48 + param]
    default:                return cmd
  }
}

const pedalModeHuman = {
  0: 'soft',
  1: 'medium',
  2: 'hard'
}

const tiltAngleHuman = {
  0: 'low',
  1: 'medium',
  2: 'high'
}

const speedAlarmsHuman = {
  0: '1 + 2 + PWM',
  1: '2 + PWM',
  2: 'PWM only',
  3: 'Sport'
}

async function sendCommand(cmd, param) {
  await characteristic.writeValue(new Uint8Array(commands(cmd, param)))
}

async function scan() {
  device = await navigator.bluetooth.requestDevice(
    { filters: [{ namePrefix: 'GotWay' }], optionalServices: [0xFFE0]})
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
  document.getElementById('scan-disconnect').innerText = 'Disconnect'
  document.getElementById('scan-disconnect').className = 'btn-lg btn-danger'
  document.getElementById('scan-disconnect').onclick = disconnect
  document.getElementById('packet-switch').classList.toggle('invisible')
  await sendCommand('fetchModel')
}

function disconnect() {
  device.gatt.disconnect()
  document.getElementById('scan-disconnect').innerText = 'Scan'
  document.getElementById('scan-disconnect').className = 'btn-lg btn-primary'
  document.getElementById('scan-disconnect').onclick = scan
  document.getElementById('packet-switch').classList.toggle('invisible')
}

async function exitYmodem() {
  await sendCommand([1, 0, 255, 65, 0, 1, 0].concat(Array(13).fill(0)))

  for (i = 0; i < 5; i++)
    await sendCommand(Array(20).fill(0))

  await sendCommand(Array(11).fill(0).concat([19, 77]))
}

function setField(field, val) {
  document.getElementById(field).value = val
}

async function setWheelModel(data) {
  wheelModel = Decoder.decode(data.buffer.slice(5)).trim()
  setField('wheel-model', wheelModel)
  await sendCommand('fetchModelCode')
}

function setWheelCodeName(data) {
  wheelCodeName = Decoder.decode(data.buffer.slice(2))
  setField('wheel-code-name', wheelCodeName)
}

function setImuModel(data) {
  imuModel = Decoder.decode(data.buffer.slice(1, 8))
  setField('imu-model', imuModel)
}

async function switchToMainPackets() {
  characteristic.removeEventListener('characteristicvaluechanged', readExtendedPackets)
  document.getElementById('extended').style.display = 'none'
  document.getElementById('main').style.display = null
  document.getElementById('packet-switch').innerText = 'Switch to extended packets'
  document.getElementById('packet-switch').onclick = switchToExtendedPackets
  await sendCommand('mainPacket')
  characteristic.addEventListener('characteristicvaluechanged', readMainPackets)
}

async function switchToExtendedPackets() {
  characteristic.removeEventListener('characteristicvaluechanged', readMainPackets)
  document.getElementById('main').style.display = 'none'
  document.getElementById('extended').style.display = null
  document.getElementById('packet-switch').innerText = 'Switch to main packets'
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
  if (wheelModel == '')
    return

  minVoltage = modelParams()['voltMultiplier'] * modelParams()['minCellVolt'] * 16
  maxVoltage = modelParams()['voltMultiplier'] * maxCellVolt * 16
  voltageHelp.innerText = `min: ${minVoltage}v - max: ${maxVoltage}v`
}

function readFirstMainPacket(data) {
  voltage = data.getUint16(2) / 100
  scaledVoltage = (voltage * modelParams()['voltMultiplier']).toFixed(2)
  setField('voltage', scaledVoltage)

  voltageHelp = document.getElementById('voltage-help')
  if (voltageHelp.innerText == '')
    updateVoltageHelpText()

  battery = (100 * (voltage / baseCellSeries - modelParams()['minCellVolt']) /
   (maxCellVolt - modelParams()['minCellVolt'])).toFixed(2)
  setField('battery', battery)

  speed = Math.abs(data.getInt16(4) * 3.6 / 100).toFixed(1)
  setField('speed', speed)

  tripDistance = (data.getUint32(6) / 1000).toFixed(2)
  setField('trip-distance', tripDistance)

  phaseCurrent = data.getInt16(10) / 100
  setField('phase-current', phaseCurrent)

  temp = (data.getInt16(12) / 340 + 36.53).toFixed(2)
  setField('temp', temp)

  resets = data.getInt16(14)
  if (resets > 10)
    resets -= 9
  setField('resets', resets)

  volume = data.getInt16(16)
  setField('volume', volume)
}

function readSecondMainPacket(data) {
  totalDistance = (data.getUint32(6) / 1000).toFixed(2)
  setField('total-distance', totalDistance)

  settings = data.getUint16(10)
  pedalMode   = settings >> 13 & 0x3
  speedAlarms = settings >> 10 & 0x3
  tiltAngle   = settings >>  7 & 0x3
  setField('pedal-mode', pedalModeHuman[pedalMode])
  setField('speed-alarms', speedAlarmsHuman[speedAlarms])
  setField('tilt-angle', tiltAngleHuman[tiltAngle])

  powerOffTime = data.getUint16(12)
  powerOffMinutes = Math.floor(powerOffTime / 60)
  powerOffSeconds = powerOffTime - (powerOffMinutes * 60)
  setField('poweroff-timer', `${powerOffMinutes}:${powerOffSeconds}`)

  tiltbackSpeed = data.getUint16(14)
  setField('tiltback-speed', tiltbackSpeed)

  ledMode = data.getUint16(16)
  setField('led-mode', ledMode)

  alarms = data.getUint16(18)
  alarm1 = alarms >> 8 & 0x1
  setField('alarm1', alarm1)

  if (alarm1 == 1 && pwmAlarmSpeed == 0)
    updatePwmAlarmSpeed()

  alarm2 = alarms >> 8 & 0x6
  setField('alarm2', alarm2)
}

function readMainPackets(event) {
  data = event.target.value

  if (data.getInt16(0) == 0x55AA) {
    readFirstMainPacket(data)
  } else if (data.getUint16(0) == 0x5A5A) {
    readSecondMainPacket(data)
  } else if (data.getUint32(0) == 0x4E414D45) {
    setWheelModel(data)
  } else if (data.getInt16(0) == 0x4757) {
    setWheelCodeName(data)
  } else if (data.getInt32(0) == 0x204D5055) {
    setImuModel(data)
  } else {
    // unhandled packet
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

function appendTempHelp() {
  tempElement = document.getElementById('Tem')
  tempHelp = document.createElement('small')
  tempHelp.className = 'form-text text-muted'
  tempHelp.textContent = 'MPU6500 format'
  tempElement.after(tempHelp)
}

function readExtendedPackets(event) {
  fragment = Decoder.decode(event.target.value)
  if (line == '')
    line = fragment
  else
    line += fragment;

  if (fragment.endsWith('\r\n')) {
    keys = line.match(/[a-zA-Z_/=]+/g)
    keys = keys.map(l => l.split('=')[0])
    values = line.match(/[-0-9]+/g)

    pwmIndex = keys.indexOf('PWM')
    if (pwmIndex != 1) {
      pwm = Math.abs(values[pwmIndex] / 100).toFixed(1)
      gauge.set(pwm)
    }

    tempIndex = keys.indexOf('Tem')
    if (tempIndex != 1)
      values[tempIndex] = (values[tempIndex] / 333.87 + 21.0).toFixed(2)

    if (rendered) {
      try { keys.forEach((key, i) => setField(key, values[i])) }
      catch { rendered = false }
    }
    else {
      html = ''
      keys.forEach((key, i) => html += appendElement(key, values[i]))
      document.getElementById('extended-data').innerHTML = html
      appendTempHelp()
      rendered = true
    }

    line = ''
  }
}
