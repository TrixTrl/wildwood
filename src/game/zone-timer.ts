import { CAMPAIGN_MAPS } from "../../shared/campaign-registry";
import { GUILD_HALL_MAP_PREFIX } from "../../shared/guild-hall";
import { ONBOARDING_MAP_ID } from "../../shared/onboarding";
import { PROCEDURAL_PREFIX } from "../../shared/procedural-map-core";
import { MAP_DISPLAY_NAMES } from "../../shared/rules";
import { SOUL_MAP_ID } from "../../shared/soul-dimension";
import { formatTimerMs } from "../../shared/timer-format";
import { TOWN_MAP_ID } from "../../shared/town";
import { MapId } from "./world";

const TIMER_VALUES = 11;
const OFFSET = 4;
const HISTORY_SIZE = 3;

type TimeStorage = { [index: string]: { bestTime: number, prestige: number, previousPB?: number, allTimes: Array<{ prestige: number, time: number }> } };

type OtherTimeStorage = { [index: number]: { startTime: number, currentTime: number, mapTimes: { [index: string]: { time: number } } } };

let lastChangedMap: MapId | undefined;

export function saveTime(time: number, mapId: MapId, prestige: number, identity: string) {
  return;
  //console.log(`${prestige} | ${mapId} | ${formatTimerMs(time)}`);
  const currentStorage = localStorage.getItem(`wildjank:timerValues-${identity}`);
  //console.log(currentStorage);
  if (currentStorage) {
    try {
      const data = JSON.parse(currentStorage) as TimeStorage;
      //console.log(data);
      //console.log(typeof (data));
      if (typeof (data) !== "object") throw `Failed to parse timer values`;
      const relevantTime = data[mapId];
      //console.log(relevantTime);
      if (relevantTime) {
        if (relevantTime.prestige < prestige) {
          if (relevantTime.bestTime > time) {
            if (relevantTime.previousPB === undefined || relevantTime.bestTime < relevantTime.previousPB) {
              relevantTime.previousPB = relevantTime.bestTime;
              lastChangedMap = mapId;
            }
            relevantTime.bestTime = time;
            relevantTime.prestige = prestige;
          }
          relevantTime.allTimes.push({ prestige: prestige, time: time });
        }
      } else {
        data[mapId] = { bestTime: time, prestige: prestige, allTimes: [{ prestige: prestige, time: time }] };
      }
      //console.log(data);
      //console.log(JSON.stringify(data));
      localStorage.setItem(`wildjank:timerValues-${identity}`, JSON.stringify(data));
      return;
    } catch (e) {

    }
  }
  const data = { [mapId]: { bestTime: time, prestige: prestige, allTimes: [{ prestige: prestige, time: time }] } };
  localStorage.setItem(`wildjank:timerValues-${identity}`, JSON.stringify(data));
  //storage.setItem(`timerValues-${identity}`, currentStorage);
}

export function getTimes(identity: string): TimeStorage {
  const currentStorage = localStorage.getItem(`wildjank:timerValues-${identity}`);
  if (currentStorage) {
    try {
      const data = JSON.parse(currentStorage) as TimeStorage;
      if (typeof (data) !== "object") throw `Failed to parse timer values`;
      return data;
    } catch (e) {
    }
  }
  const data = {};
  return data;
}

export function rollBackTime(mapId: string, identity: string) {
  const currentStorage = localStorage.getItem(`wildjank:timerValues-${identity}`);
  if (!currentStorage) return;
  try {
    const data = JSON.parse(currentStorage) as TimeStorage;
    if (typeof (data) !== "object") throw `Failed to parse timer values`;
    const relevantTime = data[mapId];
    if (!relevantTime || !relevantTime.previousPB) return;
    relevantTime.bestTime = relevantTime.previousPB;
  } catch (e) {
  }
}

export function createTimer() {
  return;
  const sheet = document.createElement('section');
  sheet.id = 'timerSheet';
  for (let i = 0; i < TIMER_VALUES; i++) {
    const row = document.createElement('div');
    row.id = `timer-${i + 1}`;
    sheet.appendChild(row);
  }
  document.getElementById('hud')!.append(sheet);
}

export function updateTimeValues(identity: string, centreValue: MapId, prestige: number) {
  return;
  const mapId = (n: number) => n < CAMPAIGN_MAPS.length ? CAMPAIGN_MAPS[n].id : `${PROCEDURAL_PREFIX}${n - 14}`;
  const timerValues = [];
  for (let i = 0; i < TIMER_VALUES; i++) {
    timerValues.push(document.getElementById(`timer-${i + 1}`));
  }
  const times = getTimes(identity);
  const findIndex = CAMPAIGN_MAPS.findIndex(m => m.id === centreValue);
  const mapIndex = findIndex === -1 ? (parseInt(centreValue.split('_')[1]) + 14) : findIndex;
  const realCentre = Math.max(mapIndex, OFFSET);
  const timeFormat = (timestamp: { prestige: number, time: number } | undefined) => {
    if (!timestamp) return `--:--`;
    return `${formatTimerMs(timestamp.time)}`;
  };
  const labelText = (mapId: string) => {
    const time = times[mapId] ?? { bestTime: -1, prestige: -1, allTimes: [] };
    //if (!time) return `${mapId}: ---`;
    //return `${mapId}: [${time.prestige}] ${formatTimerMs(time.bestTime)} ${time.previousPB ? `${formatTimerMs(time.previousPB)}` : ``}`;
    let output = `${mapId}: `;
    for (let i = prestige; i >= Math.max(prestige - HISTORY_SIZE, 0); i--) {
      output += `[${i}] ${timeFormat(time.allTimes.find(t => t.prestige === i))}  `;
    }
    return output;
  };
  for (let i = 0; i < TIMER_VALUES; i++) {
    const timer = timerValues[i];
    if (timer) {
      timer.classList.remove('highlighted-row');
      timer.textContent = labelText(mapId(realCentre - OFFSET + i));
      if (realCentre - OFFSET + i === mapIndex) timer.classList.add('highlighted-row');
    }
  }
}

export function installZoneTimeTracker(mapId?: () => MapId, identity?: () => string | undefined, prestige?: () => number | undefined) {
  let installed = false;
  window.setInterval(() => {
    if (identity?.() === undefined) return;
    if (!installed) {
      const i = identity();
      const p = prestige?.();
      if (i !== undefined && p !== undefined) {
        createZoneTimeTracker(i, p);
        installed = true;
      }
    }
    const currentStorage = localStorage.getItem(`wildjank:otherTimer-${identity?.()}`);
    //console.log(currentStorage);
    //console.log(currentStorage);
    if (currentStorage) {
      try {
        const data = JSON.parse(currentStorage) as OtherTimeStorage;
        if (typeof (data) !== "object") throw new Error(`Failed to parse timer values`);
        const prestigeValue = prestige?.();
        if (!prestigeValue) throw new Error(`Failed to get prestige`);
        const relevantSlot = data[prestigeValue];
        //console.log(relevantTime);
        if (relevantSlot) {
          const timePassed = Date.now() - relevantSlot.startTime;
          if (timePassed < 1000 && ![ONBOARDING_MAP_ID, SOUL_MAP_ID, TOWN_MAP_ID].includes(mapId?.() ?? "") && !mapId?.()?.startsWith(GUILD_HALL_MAP_PREFIX)) {
            relevantSlot.currentTime += timePassed;
          }
          relevantSlot.startTime = Date.now();
        } else {
          data[prestigeValue] = { startTime: Date.now(), currentTime: 0, mapTimes: {} };
        }
        localStorage.setItem(`wildjank:otherTimer-${identity?.()}`, JSON.stringify(data));
        return;
      } catch (e) {

      }
    } else {
      const prestigeValue = prestige?.();
      if (!prestigeValue) return;
      const data: OtherTimeStorage = { [prestigeValue]: { startTime: Date.now(), currentTime: 0, mapTimes: {} } };
      localStorage.setItem(`wildjank:otherTimer-${identity?.()}`, JSON.stringify(data));
    }
  }, 100);
}

export function saveZoneTime(mapId: string, identity: string, prestige: number) {
  const currentStorage = localStorage.getItem(`wildjank:otherTimer-${identity}`);
  if (!currentStorage) return;
  try {
    const data = JSON.parse(currentStorage) as OtherTimeStorage;
    if (typeof (data) !== "object") throw new Error(`Failed to parse timer values`);
    const relevantSlot = data[prestige];
    if (!relevantSlot) return;
    if (relevantSlot.mapTimes[mapId]) return;
    relevantSlot.mapTimes[mapId] = { time: relevantSlot.currentTime };
    localStorage.setItem(`wildjank:otherTimer-${identity}`, JSON.stringify(data));
    updateZoneTimeTracker(identity, prestige);
  } catch (e) { }
}

export function getZoneTime(mapId: string, identity: string, prestige: number): { time: number } | undefined {
  const currentStorage = localStorage.getItem(`wildjank:otherTimer-${identity}`);
  if (!currentStorage) return;
  try {
    const data = JSON.parse(currentStorage) as OtherTimeStorage;
    if (typeof (data) !== "object") throw new Error(`Failed to parse timer values`);
    const relevantSlot = data[prestige];
    if (!relevantSlot) return;
    return relevantSlot.mapTimes[mapId];
  } catch (e) { }
}

export function createZoneTimeTracker(identity: string, prestige: number) {
  const sheet = document.createElement('section');
  sheet.id = 'zoneTimerSheet';
  //sheet.style.bottom = '200px';//`calc(${document.getElementById('chatPannel')?.style.top} + 5px)`;
  document.getElementById('hud')!.append(sheet);
  updateZoneTimeTracker(identity, prestige);
}

export function updateZoneTimeTracker(identity: string, prestige: number) {
  const tracker = document.getElementById('zoneTimerSheet');
  if (!tracker) return;
  //tracker.childNodes.forEach(c => c.remove());
  while (tracker.childNodes.length > 0) tracker.childNodes[0].remove();
  const currentStorage = localStorage.getItem(`wildjank:otherTimer-${identity}`);
  if (!currentStorage) return;
  try {
    const data = JSON.parse(currentStorage) as OtherTimeStorage;
    if (typeof (data) !== "object") throw new Error(`Failed to parse timer values`);
    const max = maxMap(data);
    const mapId = (n: number) => n < CAMPAIGN_MAPS.length ? CAMPAIGN_MAPS[n].id : `${PROCEDURAL_PREFIX}${n - 14}`;
    const timestamp = (n?: number) => n === undefined ? `--:--:--` : `${Math.floor(n / (1000 * 60 * 60)).toString().padStart(2, '0')}:${formatTimerMs(n % (1000 * 60 * 60))}`;
    for (let i = 0; i <= max.index; i++) {
      const element = document.createElement('div');
      const map = mapId(i);
      const bestTimeValue = bestTime(data, map, prestige);
      const bestTimePrevValue = bestTime(data, i > 0 ? mapId(i - 1) : '', prestige);
      const zoneTime = i > 0 && data[prestige]?.mapTimes[map] && data[prestige]?.mapTimes[mapId(i - 1)] ? (data[prestige]?.mapTimes[map]?.time - data[prestige]?.mapTimes[mapId(i - 1)].time) : (i == 0 && data[prestige]?.mapTimes[map] ? data[prestige]?.mapTimes[map]?.time : 0);
      const zoneTimeText = zoneTime > 0 ? ` ${formatTimerMs(zoneTime)}` : '--:--';
      const bestZoneTime = i > 0 && bestTimeValue && bestTimePrevValue ? bestTimeValue - bestTimePrevValue : (i == 0 && bestTimeValue ? bestTimeValue : 0);
      const timeSplit = bestZoneTime > 0 && zoneTime > 0 ? zoneTime - bestZoneTime : 0;
      const splitText = ` ${timeSplit < 0 ? `-${formatTimerMs(-timeSplit)}` : `+${formatTimerMs(timeSplit)}`}`;
      //element.textContent = `${map}: ${timestamp(data[prestige]?.mapTimes[map]?.time)}${zoneTimeText} ${splitText} ${timestamp(data[prestige - 1]?.mapTimes[map]?.time)} ${timestamp(bestTime(data, map))}`;
      const mapLabel = MAP_DISPLAY_NAMES[map] ?? `Endless - ${i - 14}`;
      const totalTimeSplit = data[prestige]?.mapTimes[map] && bestTimeValue !== undefined ? data[prestige]?.mapTimes[map].time - bestTimeValue : undefined;
      const totalTimeSplitText = totalTimeSplit !== undefined ? ` ${totalTimeSplit < 0 ? `-${formatTimerMs(-totalTimeSplit)}` : `+${formatTimerMs(totalTimeSplit)}`}` : '+00:00';
      const previousTime = i > 0 && data[prestige - 1]?.mapTimes[map] && data[prestige - 1]?.mapTimes[mapId(i - 1)] ? data[prestige - 1]?.mapTimes[map].time - data[prestige - 1]?.mapTimes[mapId(i - 1)].time : (data[prestige - 1]?.mapTimes[map] ? data[prestige - 1]?.mapTimes[map].time : 0);
      const previousTimeText = previousTime > 0 ? `${formatTimerMs(previousTime)}` : '--:--';
      const previousTimeSplit = previousTime > 0 && zoneTime > 0 ? zoneTime - previousTime : 0;
      const previousSplitText = `${previousTimeSplit < 0 ? `-${formatTimerMs(-previousTimeSplit)}` : `+${formatTimerMs(previousTimeSplit)}`}`;
      const previousFullTimeSplit = data[prestige]?.mapTimes[map] && data[prestige - 1]?.mapTimes[map] ? data[prestige]?.mapTimes[map].time - data[prestige - 1]?.mapTimes[map].time : 0;
      const previousFullTimeSplitText = `${previousFullTimeSplit < 0 ? `-${formatTimerMs(-previousFullTimeSplit)}` : `+${formatTimerMs(previousFullTimeSplit)}`}`;
      const mapLabelElement = document.createElement('div');
      mapLabelElement.classList.add('time-tracker-map-label');
      mapLabelElement.textContent = mapLabel;
      element.appendChild(mapLabelElement);
      const currentPrestigeTimestampElement = document.createElement('div');
      currentPrestigeTimestampElement.classList.add('time-tracker-current-prestige');
      currentPrestigeTimestampElement.textContent = timestamp(data[prestige]?.mapTimes[map]?.time);
      currentPrestigeTimestampElement.title = 'Current Prestige Timestamp';
      element.appendChild(currentPrestigeTimestampElement);
      const zoneTimeTextElement = document.createElement('div');
      zoneTimeTextElement.classList.add('time-tracker-zone-time');
      zoneTimeTextElement.textContent = zoneTimeText;
      zoneTimeTextElement.title = 'Current Prestige Zone Time';
      element.append(zoneTimeTextElement);
      const previousTimeTextElement = document.createElement('div');
      previousTimeTextElement.classList.add('time-tracker-previous-time');
      previousTimeTextElement.textContent = previousTimeText;
      previousTimeTextElement.title = 'Previous Prestige Zone Time';
      element.append(previousTimeTextElement);
      const previousSplitTextElement = document.createElement('div');
      previousSplitTextElement.classList.add('time-tracker-previous-split-text');
      previousSplitTextElement.classList.add(previousTimeSplit == 0 ? 'grey' : previousTimeSplit > 0 ? 'red' : 'green');
      previousSplitTextElement.textContent = previousSplitText;
      previousSplitTextElement.title = 'Zone Time Split Compared To Last Prestige';
      element.appendChild(previousSplitTextElement);
      const previousFullSplitTextElement = document.createElement('div');
      previousFullSplitTextElement.classList.add('time-tracker-previous-split-text');
      previousFullSplitTextElement.classList.add(previousFullTimeSplit == 0 ? 'grey' : previousFullTimeSplit > 0 ? 'red' : 'green');
      previousFullSplitTextElement.textContent = previousFullTimeSplitText;
      previousFullSplitTextElement.title = 'Full Time Split Compared To Last Prestige';
      element.appendChild(previousFullSplitTextElement);
      const splitTextElement = document.createElement('div');
      splitTextElement.classList.add('time-tracker-split-text');
      splitTextElement.classList.add(timeSplit == 0 ? 'grey' : timeSplit > 0 ? 'red' : 'green');
      splitTextElement.textContent = splitText;
      splitTextElement.title = 'Split Compared To Best Map Values';
      element.appendChild(splitTextElement);
      const totalSplitTextElement = document.createElement('div');
      totalSplitTextElement.classList.add('time-tracker-total-split-text');
      totalSplitTextElement.classList.add(totalTimeSplit == 0 || totalTimeSplit === undefined ? 'grey' : totalTimeSplit > 0 ? 'red' : 'green');
      totalSplitTextElement.textContent = totalTimeSplitText;
      totalSplitTextElement.title = 'Split Compared To Best Timestamp';
      element.appendChild(totalSplitTextElement);
      const previousPrestigeTimestampElement = document.createElement('div');
      previousPrestigeTimestampElement.classList.add('time-tracker-previous-prestige');
      previousPrestigeTimestampElement.textContent = timestamp(data[prestige - 1]?.mapTimes[map]?.time);
      previousPrestigeTimestampElement.title = 'Previous Prestige Timestamp';
      element.appendChild(previousPrestigeTimestampElement);
      const bestTimeElement = document.createElement('div');
      bestTimeElement.classList.add('time-tracker-best-time');
      bestTimeElement.textContent = timestamp(bestTimeValue);
      bestTimeElement.title = 'Best Prestige Timestamp';
      element.appendChild(bestTimeElement);
      tracker.appendChild(element);
    }
  } catch (e) { console.error(e); }
  //for () {}
}

function maxMap(storage: OtherTimeStorage): { mapId: MapId, index: number } {
  const mapId = (n: number) => n < CAMPAIGN_MAPS.length ? CAMPAIGN_MAPS[n].id : `${PROCEDURAL_PREFIX}${n - 14}`;
  let highestMapFound = 0;
  for (const key of Object.keys(storage)) {
    const s = storage[Number(key)];
    if (!s) continue;
    for (const mapKey of Object.keys(s.mapTimes)) {
      const findIndex = CAMPAIGN_MAPS.findIndex(m => m.id === mapKey);
      const mapIndex = findIndex === -1 ? (parseInt(mapKey.split('_')[1]) + 14) : findIndex;
      highestMapFound = Math.max(highestMapFound, mapIndex);
    }
  }
  return { mapId: mapId(highestMapFound) as MapId, index: highestMapFound };
}

function bestTime(storage: OtherTimeStorage, mapId: string, prestige: number): number | undefined {
  let lowestValueFound;
  for (const key of Object.keys(storage)) {
    if (Number(key) === prestige) continue;
    const s = storage[Number(key)];
    if (!s) continue;
    if (s.mapTimes[mapId]) {
      if (!lowestValueFound || s.mapTimes[mapId].time < lowestValueFound) {
        lowestValueFound = s.mapTimes[mapId].time;
      }
    }
  }
  return lowestValueFound;
}
