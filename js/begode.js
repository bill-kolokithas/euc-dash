const Debug = new URL(window.location.href).searchParams.get('debug')
const Decoder = new TextDecoder()
const MaxCellVolt = 4.2
const BaseCellSeries = 16
const FramePacketLength = 24
const BluetoothPacketLength = 20
const ResetStatisticsSpeedThreshold = 4
const BrakingCurrentThreshold = -20
const PwmTiltbackMode = 3

function modelParams() {
  switch(wheelModel) {
    case 'Mten3':       return { 'voltMultiplier': 1.25, 'minCellVolt': 3.3 }
    case 'MCM5':        return { 'voltMultiplier': 1.25, 'minCellVolt': 3.3 }
    case 'T3':          return { 'voltMultiplier': 1.25, 'minCellVolt': 3.25 }
    case 'Mten4':       return { 'voltMultiplier': 1.25, 'minCellVolt': 3.1 }
    case 'Mt3n4':       return { 'voltMultiplier': 1.50, 'minCellVolt': 3.0 }
    case 'Msuper Pro':  return { 'voltMultiplier': 1.50, 'minCellVolt': 3.25 }
    case 'MSP C30':     return { 'voltMultiplier': 1.50, 'minCellVolt': 3.25 }
    case 'MSP C38':     return { 'voltMultiplier': 1.50, 'minCellVolt': 3.25 }
    case 'RS C30':      return { 'voltMultiplier': 1.50, 'minCellVolt': 3.25 }
    case 'RS C38':      return { 'voltMultiplier': 1.50, 'minCellVolt': 3.25 }
    case 'EX':          return { 'voltMultiplier': 1.50, 'minCellVolt': 3.25 }
    case 'EXN':         return { 'voltMultiplier': 1.50, 'minCellVolt': 3.25 }
    case 'Monster':     return { 'voltMultiplier': 1.50, 'minCellVolt': 3.25 }
    case 'HERO':        return { 'voltMultiplier': 1.50, 'minCellVolt': 3.1 }
    case 'T4':          return { 'voltMultiplier': 1.50, 'minCellVolt': 3.1 }
    case 'Nikola':      return { 'voltMultiplier': 1.50, 'minCellVolt': 3.0 }
    case 'EXN C30':     return { 'voltMultiplier': 1.50, 'minCellVolt': 3.0 }
    case 'EXN C38':     return { 'voltMultiplier': 1.50, 'minCellVolt': 3.0 }
    case 'EX20S C30':   return { 'voltMultiplier': 1.50, 'minCellVolt': 3.0 }
    case 'EX20S C38':   return { 'voltMultiplier': 1.50, 'minCellVolt': 3.0 }
    case 'Monster Pro': return { 'voltMultiplier': 1.50, 'minCellVolt': 3.0 }
    case 'Master Pro':  return { 'voltMultiplier': 2,    'minCellVolt': 3.1 }
    case 'Master X':    return { 'voltMultiplier': 2,    'minCellVolt': 3.1 }
    case 'Torque':      return { 'voltMultiplier': 2,    'minCellVolt': 3.1 }
    case 'Master':      return { 'voltMultiplier': 2,    'minCellVolt': 3.05 }
    case 'Master C38':  return { 'voltMultiplier': 2,    'minCellVolt': 3.05 }
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
    case 'volume':          return [87, 66, 48 + param]
    case 'ledMode':         return [87, 77, 48 + param]
    case 'tiltbackSpeed':   return [87, 89, param.charCodeAt(0), param.charCodeAt(1)]
    case 'pwmLimit':        return [87, 80, param.charCodeAt(0), param.charCodeAt(1)]
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
    await new Promise(r => setTimeout(r, 200))
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
  speedUnitMode = 0
  speedAlertMode = 0
  pwmAlarmSpeed = 0
  phaseCurrent = 0
  maxSpeed = 0
  maxSpeedSinceStop = 0
  maxPwm = 0
  maxPwmSinceStop = 0
  maxPhaseCurrent = 0
  maxPhaseCurrentSinceStop = 0
  minPhaseCurrent = 0
  minPhaseCurrentSinceStop = 0
  maxBattery = 0
  minBattery = 150
  maxTemperature = 0
  startingDistance = 0
  brakingDistance = 0
  brakingSpeed = 0
  updateStatistics = false
  pwmEnabled = false
  polarity = 1
  rendered = false
  wheelModel = ''
  firmware = ''
  updateTiltbackSpeed = true
  updatePwmLimit = true
  logs = ''
  framePacket1Support = false
  frame = new Uint8Array(FramePacketLength)
  previousFrame = new Uint8Array(FramePacketLength)
  previousFrameLength = 0
  getField('scan-disconnect').innerText = 'Disconnect'
  getField('scan-disconnect').className = 'btn-lg btn-danger'
  getField('scan-disconnect').onclick = disconnect
  getField('packet-switch').classList.remove('invisible')
  getField('save-logs').classList.remove('invisible')
  updateVoltageHelpText()

  await sendCommand('fetchModel')
}

function enableFramePacket1Support() {
  framePacket1Support = true
  showField('pwm-limit-slider')
  showField('remaining-distance-field')
}

function disconnect() {
  device.gatt.disconnect()
  getField('scan-disconnect').innerText = 'Scan & Connect'
  getField('scan-disconnect').className = 'btn-lg btn-primary'
  getField('scan-disconnect').onclick = scan
  getField('packet-switch').classList.add('invisible')
  getField('save-logs').classList.add('invisible')
}

function saveLogs() {
  anchor = getField('save-logs')
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
    await sendCommand(Array(BluetoothPacketLength).fill(0))

  await sendCommand(Array(11).fill(0).concat([19, 77]))
}

async function setTiltbackSpeed(speed) {
  updateTiltbackSpeed = true
  speed = speed.padStart(2, '0')

  if (speed == 0 || speed == 100)
    await sendCommand('tiltbackOff')
  else
    await sendCommand('tiltbackSpeed', speed)
}

async function setPwmLimit(pwmLimit) {
  updatePwmLimit = true
  await sendCommand('pwmLimit', pwmLimit)
}

function getField(field) {
  return document.getElementById(field)
}

function showField(field) {
  getField(field).style.display = null
}

function hideField(field) {
  getField(field).style.display = 'none'
}

function checkField(field) {
  getField(field).checked = true
}

function setField(field, value) {
  getField(field).value = value
}

function clearField(field, value) {
  getField(field).value = null
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
}

async function switchToMainPackets() {
  characteristic.removeEventListener('characteristicvaluechanged', readExtendedPackets)
  hideField('extended')
  showField('main')
  getField('packet-switch').innerText = 'Extended packets ->'
  getField('packet-switch').onclick = switchToExtendedPackets
  await sendCommand('mainPacket')
  characteristic.addEventListener('characteristicvaluechanged', readMainPackets)
}

async function switchToExtendedPackets() {
  characteristic.removeEventListener('characteristicvaluechanged', readMainPackets)
  hideField('main')
  showField('extended')
  getField('packet-switch').innerText = '<- Main packets'
  getField('packet-switch').onclick = switchToMainPackets
  line = ''
  setupGauge()
  await sendCommand('extendedPacket')
  characteristic.addEventListener('characteristicvaluechanged', readExtendedPackets)
}

function reversePolarity() {
  if (polarity == 1) {
    getField('reverse-polarity').className = 'btn btn-sm btn-outline-danger'
    getField('reverse-polarity').innerText = 'Negative'
  } else {
    getField('reverse-polarity').className = 'btn btn-sm btn-outline-success'
    getField('reverse-polarity').innerText = 'Positive'
  }

  polarity = -polarity
}

function updatePwmAlarmSpeed() {
  pwmAlarmSpeed = speed
  setField('pwm-alarm-speed', pwmAlarmSpeed.toFixed(1) + (speedUnitMode == 0 ? ' km/h' : ' mi/h'))

  speedReduction = 1 - (100 - battery) / 450
  alarmSpeed100 = (speed / speedReduction).toFixed(1)
  setField('pwm-alarm-100', alarmSpeed100 + (speedUnitMode == 0 ? ' km/h' : ' mi/h'))

  alarmSpeeds = [10, 30, 50, 80].forEach(batt => {
    speedReduction = 1 - (100 - batt) / 450
    setField(`pwm-alarm-${batt}`, (alarmSpeed100 * speedReduction).toFixed(1) + (speedUnitMode == 0 ? ' km/h' : ' mi/h'))
  })
}

function updateSpeedStatistics() {
  if (speed > maxSpeed) {
    maxSpeed = speed
    setField('max-speed', maxSpeed.toFixed(1) + (speedUnitMode == 0 ? ' km/h' : ' mi/h'))
  }

  if (!updateStatistics && speed > ResetStatisticsSpeedThreshold) {
    maxSpeedSinceStop = 0
    clearField('max-speed-since-stop')
    maxPwmSinceStop = 0
    clearField('max-pwm-since-stop')
    maxPhaseCurrentSinceStop = 0
    clearField('max-phase-current-since-stop')
    minPhaseCurrentSinceStop = 0
    clearField('min-phase-current-since-stop')
    batteryStart = battery
    voltageSag = 0
    clearField('voltage-sag')
    startingDistance = 0
    brakingDistance = 0
    clearField('braking-distance')
    brakingSpeed = 0
    clearField('braking-speed')
    accelerationStartTime = new Date
    clearField('acceleration-time')
    brakingStartTime = new Date
    clearField('braking-time')
    updateStatistics = true
  } else if (updateStatistics && speed <= ResetStatisticsSpeedThreshold) {
    if (brakingSpeed != 0) {
      brakingStopTime = new Date
      brakingTime = (brakingStopTime - brakingStartTime) / 1000
      brakingDistance = tripDistance - startingDistance
      setField('braking-distance', brakingDistance + (speedUnitMode == 0 ? ' meters' : ' feet'))
      setField('braking-time', brakingTime.toFixed(1) + ' s')
    }
    updateStatistics = false
  }

  if (updateStatistics && speed > maxSpeedSinceStop) {
    maxSpeedSinceStop = speed
    accelerationStopTime = new Date
    accelerationTime = (accelerationStopTime - accelerationStartTime) / 1000
    setField('max-speed-since-stop', maxSpeedSinceStop.toFixed(1) + (speedUnitMode == 0 ? ' km/h' : ' mi/h'))
    setField('acceleration-time', accelerationTime.toFixed(1) + ' s')
  }
}

function updatePhaseCurrentStatistics() {
  if (phaseCurrent > maxPhaseCurrent) {
    maxPhaseCurrent = phaseCurrent
    setField('max-phase-current', maxPhaseCurrent + ' A')
  } else if (phaseCurrent < minPhaseCurrent) {
    minPhaseCurrent = phaseCurrent
    setField('min-phase-current', minPhaseCurrent + ' A')
  }

  if (updateStatistics) {
    if (startingDistance == 0 && phaseCurrent < BrakingCurrentThreshold) {
      startingDistance = tripDistance
      brakingStartTime = new Date
      brakingSpeed = speed
      setField('braking-speed', brakingSpeed.toFixed(1) + (speedUnitMode == 0 ? ' km/h' : ' mi/h'))
    }

    if (phaseCurrent > maxPhaseCurrentSinceStop) {
      maxPhaseCurrentSinceStop = phaseCurrent
      setField('max-phase-current-since-stop', maxPhaseCurrentSinceStop.toFixed(1) + ' A')
    } else if (phaseCurrent < minPhaseCurrentSinceStop) {
      minPhaseCurrentSinceStop = phaseCurrent
      setField('min-phase-current-since-stop', minPhaseCurrentSinceStop.toFixed(1) + ' A')
    }
  }
}

function updateBatteryStatistics() {
  battery = 100 * (voltage / BaseCellSeries - modelParams()['minCellVolt']) /
    (MaxCellVolt - modelParams()['minCellVolt'])
  setField('battery', battery.toFixed(1) + '%')

  if (battery > maxBattery) {
    maxBattery = battery
    setField('max-battery', maxBattery.toFixed(1) + '%')
  } else if (battery < minBattery && Math.abs(phaseCurrent) > 5) {
    minBattery = battery
    setField('min-battery', minBattery.toFixed(1) + '%')
  }

  if (updateStatistics) {
    batteryDiff = batteryStart - battery
    if (batteryDiff > voltageSag) {
      voltageSag = batteryDiff
      setField('voltage-sag', voltageSag.toFixed(1) + '%')
    }
  }
}

function updateTemperatureStatistics() {
  if (temperature > maxTemperature) {
    maxTemperature = temperature
    setField('max-temperature', maxTemperature.toFixed(2) + ' °C')
  }
}

function updatePwmStatistics() {
  if (pwm > maxPwm) {
    maxPwm = pwm
    setField('max-pwm', maxPwm.toFixed(1) + '%')
  }

  if (updateStatistics && pwm > maxPwmSinceStop) {
    maxPwmSinceStop = pwm
    setField('max-pwm-since-stop', maxPwmSinceStop.toFixed(1) + '%')
  }
}

function updateVoltageHelpText() {
  minVoltage = (modelParams()['voltMultiplier'] * modelParams()['minCellVolt'] * 16).toFixed(1)
  maxVoltage = (modelParams()['voltMultiplier'] * MaxCellVolt * 16).toFixed(1)

  getField('voltage-help').innerText = `min: ${minVoltage} V  max: ${maxVoltage} V`
}

function parseFramePacket0(data) {
  if (!framePacket1Support) {
    voltage = data.getUint16(2) / 100
    scaledVoltage = (voltage * modelParams()['voltMultiplier']).toFixed(1)
    setField('voltage', scaledVoltage + ' V')
    updateBatteryStatistics()
  }

  speed = Math.abs(data.getInt16(4) * 3.6 / 100)
  setField('speed', speed.toFixed(1) + (speedUnitMode == 0 ? ' km/h' : ' mi/h'))
  updateSpeedStatistics()

  if (framePacket1Support) {
    remainingDistance = data.getUint16(6)
    setField('remaining-distance', remainingDistance + (speedUnitMode == 0 ? ' km' : ' mi'))
  }

  tripDistance = data.getUint16(8)
  setField('trip-distance', (tripDistance / 1000).toFixed(2) + (speedUnitMode == 0 ? ' km' : ' mi'))

  phaseCurrent = data.getInt16(10) / 100 * polarity
  setField('phase-current', phaseCurrent + ' A')
  updatePhaseCurrentStatistics()

  // MPU6050 format
  temperature = data.getInt16(12) / 340 + 36.53
  setField('temperature', temperature.toFixed(2) + ' °C')
  updateTemperatureStatistics()

  data_value = Math.abs(data.getInt16(14))
  if (pwmEnabled) {
    pwm = data_value / 100
    setField('pwm', pwm.toFixed(1) + '%')
    updatePwmStatistics()
  } else if (speedAlertMode == PwmTiltbackMode) {
    hideField('resets-field')
    showField('pwm-field')
    showField('max-pwm-field')
    showField('max-pwm-since-stop-field')
    pwmEnabled = true
  } else {
    resets = data_value
    if (resets > 10)
      resets -= 9
    setField('resets', resets)
  }

  volume = data.getUint16(16)
  if (volume >= 1 && volume <= 9)
    checkField(`volume-${volume}`)
}

function parseFramePacket4(data) {
  totalDistance = (data.getUint32(2) / 1000).toFixed(2)
  setField('total-distance', totalDistance + (speedUnitMode == 0 ? ' km' : ' mi'))

  modes = data.getUint16(6)
  pedalMode      = modes >> 13 & 0x3
  speedAlertMode = modes >> 10 & 0x3
  rollAngleMode  = modes >>  7 & 0x3
  speedUnitMode  = modes & 0x1

  checkField(`pedal-mode-${pedalMode}`)
  checkField(`speed-alert-${speedAlertMode}`)
  checkField(`roll-angle-${rollAngleMode}`)
  checkField(`speed-unit-${speedUnitMode}`)

  powerOffTime = data.getUint16(8)
  powerOffMinutes = Math.floor(powerOffTime / 60)
  powerOffSeconds = powerOffTime - (powerOffMinutes * 60)
  setField('poweroff-timer', `${powerOffMinutes}:${powerOffSeconds}`)

  tiltbackSpeed = data.getUint16(10)
  if (updateTiltbackSpeed) {
    getField('tiltback-speed-label').innerHTML = tiltbackSpeed >= 100 ? 'Disabled' : tiltbackSpeed
    getField('tiltback-speed').value = tiltbackSpeed
  }

  ledMode = data.getUint16(12)
  checkField(`led-mode-${ledMode}`)

  faultAlarm = data.getUint8(14)
  faultAlarmLine = ''
  for (let bit = 0; bit < 8; bit++) {
    if (faultAlarm >> bit & 0x1)
      faultAlarmLine += faultAlarms[bit] + ', '
  }

  faultAlarmLine = faultAlarmLine.slice(0, -2)
  setField('fault-alarms', faultAlarmLine)

  if (faultAlarm & 0x1 && (pwmAlarmSpeed == 0 || speed < pwmAlarmSpeed))
    updatePwmAlarmSpeed()

  lightMode = data.getUint8(15) % 3
  checkField(`light-mode-${lightMode}`)
}

function parseFramePacket1(data) {
  pwmLimit = data.getUint16(2)
  if (updatePwmLimit) {
    getField('pwm-limit').value = pwmLimit
    getField('pwm-limit-label').innerHTML = pwmLimit
  }

  voltage = data.getUint16(6) / 10
  setField('voltage', voltage.toFixed(1) + ' V')
  updateBatteryStatistics()
}

function readMainPackets(event) {
  data = event.target.value
  array = new Uint8Array(data.buffer)

  if (Debug)
    logs += array + '\n'

  frameStart = array.findIndex((el, idx, arr) => {
    return arr[idx] == 85 && arr[idx + 1] == 170
  })
  frameEnd = array.findIndex((el, idx, arr) => {
    return arr[idx] == 90 && arr[idx + 1] == 90 && arr[idx + 2] == 90 && arr[idx + 3] == 90
  })

  if (frameStart == -1 && frameEnd == -1) {
    if (!Debug)
      logs += array + '\n'

    return handleRegularData(data)
  }

  if (frameEnd != -1) {
    frameLength = frameEnd + 4
    frame.set(previousFrame)
    frame.set(array.slice(0, frameLength), previousFrameLength)

    if (!Debug)
      logs += frame + '\n'

    if (previousFrameLength + frameLength == FramePacketLength)
      handleFrameData(new DataView(frame.buffer))
  }

  if (frameStart != -1) {
    previousFrame.set(array.slice(frameStart))
    previousFrameLength = BluetoothPacketLength - frameStart
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
    case 0:
      return parseFramePacket0(data)
    case 1:
      if (!framePacket1Support)
        enableFramePacket1Support()

      return parseFramePacket1(data)
    case 4:
      return parseFramePacket4(data)
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
  if (Debug)
    logs += new Uint8Array(event.target.value.buffer) + '\n'

  fragment = Decoder.decode(event.target.value)
  lineEnd = fragment.indexOf('\n')

  if (lineEnd == -1)
    line += fragment
  else {
    line += fragment.slice(0, lineEnd);

    if (!Debug)
      logs += line.replace('\r', '\n')

    keys = line.match(/[A-z/=]+/g)
    keys = keys.map(l => l.split('=')[0])
    values = line.match(/-?\d+/g)

    pwmIndex = keys.indexOf('PWM')
    divisor = 100
    if (pwmIndex == -1) {
      pwmIndex = keys.indexOf('pwmmmm')
      if (wheelModel.startsWith('EXN'))
        divisor = 10
    }

    if (pwmIndex != -1) {
      pwm = Math.abs(values[pwmIndex] / divisor).toFixed(1)
      gauge.set(pwm)
    }

    speedIndex = keys.indexOf('M/s')
    if (speedIndex != -1)
      values[speedIndex] = (values[speedIndex] * 3.6 / 1000).toFixed(1)

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
      getField('extended-data').innerHTML = html
      rendered = true
    }

    line = fragment.slice(lineEnd + 1)
  }
}
