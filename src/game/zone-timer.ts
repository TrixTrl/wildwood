import { CAMPAIGN_MAPS } from "../../shared/campaign-registry";
import { GUILD_HALL_MAP_PREFIX } from "../../shared/guild-hall";
import { ONBOARDING_MAP_ID } from "../../shared/onboarding";
import { PROCEDURAL_PREFIX } from "../../shared/procedural-map-core";
import { MAP_DISPLAY_NAMES } from "../../shared/rules";
import { SOUL_MAP_ID } from "../../shared/soul-dimension";
import { formatTimerMs } from "../../shared/timer-format";
import { TOWN_MAP_ID } from "../../shared/town";
import { setHidden } from "../ui/dom-write";
import { installMovableHudCard } from "../ui/movable-hud-card";
import { renderBooleanSetting } from "../ui/settings";
import { MapId } from "./world";

const TIMER_VALUES = 11;
const OFFSET = 4;
const HISTORY_SIZE = 3;

type TimeStorage = { [index: string]: { bestTime: number, prestige: number, previousPB?: number, allTimes: Array<{ prestige: number, time: number }> } };

type OtherTimeStorage = { [index: number]: { startTime: number, currentTime: number, mapTimes: { [index: string]: { time: number } }, invalid?: boolean } };

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
    if (currentStorage) {
      try {
        const data = JSON.parse(currentStorage) as OtherTimeStorage;
        if (typeof (data) !== "object") throw new Error(`Failed to parse timer values`);
        const prestigeValue = prestige?.();
        if (prestigeValue === undefined) return;
        const relevantSlot = data[prestigeValue];
        if (relevantSlot) {
          const timePassed = Date.now() - relevantSlot.startTime;
          if (timePassed < 1000 && ![ONBOARDING_MAP_ID, SOUL_MAP_ID, TOWN_MAP_ID].includes(mapId?.() ?? "") && !mapId?.()?.startsWith(GUILD_HALL_MAP_PREFIX)) {
            relevantSlot.currentTime += timePassed;
          }
          relevantSlot.startTime = Date.now();
        } else {
          data[prestigeValue] = { startTime: Date.now(), currentTime: 0, mapTimes: {} };
          const i = identity();
          if (i !== undefined) {
            timerInvalidated = true;
            updateZoneTimeTracker(i, prestigeValue)
          };
        }
        invalidate(data);
        const activeTimer = document.getElementById('active-timer');
        if (activeTimer && ![ONBOARDING_MAP_ID, SOUL_MAP_ID, TOWN_MAP_ID].includes(mapId?.() ?? "") && !mapId?.()?.startsWith(GUILD_HALL_MAP_PREFIX)) {
          const getMapId = (n: number) => n < CAMPAIGN_MAPS.length ? (CAMPAIGN_MAPS[n]?.id ?? '') : `${PROCEDURAL_PREFIX}${n - 14}`;
          const furthestMapId = getMapId(Object.keys(data[prestigeValue].mapTimes).length);
          const findIndex = CAMPAIGN_MAPS.findIndex(m => m.id === furthestMapId);
          const mapIndex = findIndex === -1 ? (parseInt(furthestMapId.split('_')[1]) + 14) : findIndex;
          while (activeTimer.childNodes.length > 0) activeTimer.childNodes[0].remove();
          const mainTimer = document.createElement('div');
          mainTimer.classList.add('main-timer');
          const timestamp = (n: number | undefined, forceHour: boolean) => n === undefined ? `--:--:--` : `${forceHour || n >= (1000 * 60 * 60) ? Math.floor(n / (1000 * 60 * 60)).toString().padStart(2, '0') + ':' : ''}${formatTimerMs(n % (1000 * 60 * 60))}`;
          mainTimer.textContent = timestamp(data[prestigeValue].currentTime, true);
          const bestFurthestTimeValue = bestTime(data, furthestMapId, prestigeValue);
          mainTimer.classList.add(bestFurthestTimeValue === undefined ? 'grey' : (bestFurthestTimeValue > data[prestigeValue].currentTime ? 'green' : 'red'));
          activeTimer.appendChild(mainTimer);
          const zoneTimer = document.createElement('div');
          zoneTimer.classList.add('zone-timer');
          const runningTime = data[prestigeValue].currentTime - (Object.keys(data[prestigeValue].mapTimes).length > 0 ? (data[prestigeValue].mapTimes[furthestMapId]?.time ?? 0) : 0);
          //const bestTime = data[prestigeValue - 1] && data[prestigeValue - 1].mapTimes[mapId?.() ?? ""] && data[prestigeValue - 1].mapTimes[getMapId(mapIndex - 1)] ? data[prestigeValue - 1].mapTimes[mapId?.() ?? ""].time - data[prestigeValue - 1].mapTimes[getMapId(mapIndex - 1)].time : 0;
          //const bestTimeValue = bestTime(data, furthestMapId, prestigeValue);
          const bestTimeNextValue = bestTime(data, getMapId(mapIndex + 1), prestigeValue);
          const bestTimeSplit = bestFurthestTimeValue && bestTimeNextValue !== undefined ? bestTimeNextValue - bestFurthestTimeValue : 0;
          zoneTimer.textContent = timestamp(runningTime, false);
          zoneTimer.classList.add(bestTimeSplit === 0 ? 'green' : (runningTime < bestTimeSplit ? 'green' : 'red'));
          activeTimer.appendChild(zoneTimer);
        }
        localStorage.setItem(`wildjank:otherTimer-${identity?.()}`, JSON.stringify(data));
        return;
      } catch (e) { console.error(e); }
    } else {
      const prestigeValue = prestige?.();
      if (prestigeValue === undefined) return;
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
    invalidate(data);
    localStorage.setItem(`wildjank:otherTimer-${identity}`, JSON.stringify(data));
    timerInvalidated = true;
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
  const fullTimer = document.createElement('section');
  fullTimer.classList.add('full-timer');
  const activeTimer = document.createElement('section');
  activeTimer.id = 'active-timer';
  const sheet = document.createElement('section');
  sheet.id = 'zoneTimerSheet';
  fullTimer.appendChild(activeTimer);
  //fullTimer.appendChild(sheet);
  document.getElementById('hud')!.append(fullTimer);
  updateZoneTimeTracker(identity, prestige);
}

export function updateZoneTimeTracker(identity: string, prestige: number) {
  if (activeTimerRefresh) activeTimerRefresh();
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
    const mapId = (n: number) => n < CAMPAIGN_MAPS.length ? (CAMPAIGN_MAPS[n]?.id ?? '') : `${PROCEDURAL_PREFIX}${n - 14}`;
    const timestamp = (n: number | undefined, forceHour: boolean) => n === undefined ? `--:--:--` : `${forceHour || n >= (1000 * 60 * 60) ? Math.floor(n / (1000 * 60 * 60)).toString().padStart(2, '0') + ':' : ''}${formatTimerMs(n % (1000 * 60 * 60))}`;
    //const timestamp = (n?: number) => n === undefined ? `--:--:--` : `${Math.floor(n / (1000 * 60 * 60)).toString().padStart(2, '0')}:${formatTimerMs(n % (1000 * 60 * 60))}`;
    for (let i = 0; i <= Math.max(0, max.index); i++) {
      const element = document.createElement('section');
      const map = mapId(i);
      const bestTimeValue = bestTime(data, map, prestige);
      const bestTimePrevValue = bestTime(data, i > 0 ? mapId(i - 1) : '', prestige);
      const zoneTime = i > 0 && data[prestige]?.mapTimes[map] && data[prestige]?.mapTimes[mapId(i - 1)] ? (data[prestige]?.mapTimes[map]?.time - data[prestige]?.mapTimes[mapId(i - 1)].time) : (i == 0 && data[prestige]?.mapTimes[map] ? data[prestige]?.mapTimes[map]?.time : 0);
      const zoneTimeText = zoneTime > 0 ? ` ${timestamp(zoneTime, false)}` : '--:--';
      const bestZoneTime = i > 0 && bestTimeValue && bestTimePrevValue ? bestTimeValue - bestTimePrevValue : (i == 0 && bestTimeValue ? bestTimeValue : 0);
      const bestZoneTimeText = bestZoneTime > 0 ? `${timestamp(bestZoneTime, false)}` : '--:--';
      const timeSplit = bestZoneTime > 0 && zoneTime > 0 ? zoneTime - bestZoneTime : 0;
      const splitText = ` ${timeSplit < 0 ? `-${timestamp(-timeSplit, false)}` : `+${timestamp(timeSplit, false)}`}`;
      //element.textContent = `${map}: ${timestamp(data[prestige]?.mapTimes[map]?.time)}${zoneTimeText} ${splitText} ${timestamp(data[prestige - 1]?.mapTimes[map]?.time)} ${timestamp(bestTime(data, map))}`;
      const mapLabel = MAP_DISPLAY_NAMES[map] ?? `Endless - ${i - 14}`;
      const totalTimeSplit = data[prestige]?.mapTimes[map] && bestTimeValue !== undefined ? data[prestige]?.mapTimes[map].time - bestTimeValue : undefined;
      const totalTimeSplitText = totalTimeSplit !== undefined ? ` ${totalTimeSplit < 0 ? `-${timestamp(-totalTimeSplit, false)}` : `+${timestamp(totalTimeSplit, false)}`}` : '+00:00';
      const previousTime = i > 0 && data[prestige - 1]?.mapTimes[map] && data[prestige - 1]?.mapTimes[mapId(i - 1)] ? data[prestige - 1]?.mapTimes[map].time - data[prestige - 1]?.mapTimes[mapId(i - 1)].time : (data[prestige - 1]?.mapTimes[map] ? data[prestige - 1]?.mapTimes[map].time : 0);
      const previousTimeText = previousTime > 0 ? `${timestamp(previousTime, false)}` : '--:--';
      const previousTimeSplit = previousTime > 0 && zoneTime > 0 ? zoneTime - previousTime : 0;
      const previousSplitText = `${previousTimeSplit < 0 ? `-${timestamp(-previousTimeSplit, false)}` : `+${timestamp(previousTimeSplit, false)}`}`;
      const previousFullTimeSplit = data[prestige]?.mapTimes[map] && data[prestige - 1]?.mapTimes[map] ? data[prestige]?.mapTimes[map].time - data[prestige - 1]?.mapTimes[map].time : 0;
      const previousFullTimeSplitText = `${previousFullTimeSplit < 0 ? `-${timestamp(-previousFullTimeSplit, false)}` : `+${timestamp(previousFullTimeSplit, false)}`}`;
      const mapLabelElement = document.createElement('div');
      mapLabelElement.classList.add('time-tracker-map-label');
      mapLabelElement.textContent = mapLabel;
      element.appendChild(mapLabelElement);
      const currentPrestigeTimestampElement = document.createElement('div');
      currentPrestigeTimestampElement.classList.add('time-tracker-current-prestige');
      currentPrestigeTimestampElement.textContent = timestamp(data[prestige]?.mapTimes[map]?.time, true);
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
      const bestTimeTextElement = document.createElement('div');
      bestTimeTextElement.classList.add('time-tracker-best-time');
      bestTimeTextElement.textContent = bestZoneTimeText;
      bestTimeTextElement.title = 'Calculated Zone Time From Best Scores';
      element.append(bestTimeTextElement);
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
      splitTextElement.title = 'Zone Split Compared To Best Map Values';
      element.appendChild(splitTextElement);
      const totalSplitTextElement = document.createElement('div');
      totalSplitTextElement.classList.add('time-tracker-total-split-text');
      totalSplitTextElement.classList.add(totalTimeSplit == 0 || totalTimeSplit === undefined ? 'grey' : totalTimeSplit > 0 ? 'red' : 'green');
      totalSplitTextElement.textContent = totalTimeSplitText;
      totalSplitTextElement.title = 'Split Compared To Best Timestamp';
      element.appendChild(totalSplitTextElement);
      const previousPrestigeTimestampElement = document.createElement('div');
      previousPrestigeTimestampElement.classList.add('time-tracker-previous-prestige');
      previousPrestigeTimestampElement.textContent = timestamp(data[prestige - 1]?.mapTimes[map]?.time, true);
      previousPrestigeTimestampElement.title = 'Previous Prestige Timestamp';
      element.appendChild(previousPrestigeTimestampElement);
      const bestTimeElement = document.createElement('div');
      bestTimeElement.classList.add('time-tracker-best-time');
      bestTimeElement.textContent = timestamp(bestTimeValue, true);
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
    if (!s || s.invalid === true) continue;
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
    if (!s || s.invalid) continue;
    if (s.mapTimes[mapId]) {
      if (!lowestValueFound || s.mapTimes[mapId].time < lowestValueFound) {
        lowestValueFound = s.mapTimes[mapId].time;
      }
    }
  }
  return lowestValueFound;
}

function invalidate(storage: OtherTimeStorage) {
  const mapId = (n: number) => n < CAMPAIGN_MAPS.length ? (CAMPAIGN_MAPS[n]?.id ?? '') : `${PROCEDURAL_PREFIX}${n - 14}`;
  for (const k of Object.keys(storage)) {
    const key = Number(k);
    const s = storage[key];
    if (!s || s.invalid === true) continue;
    for (let i = 0; i < Object.keys(s.mapTimes).length; i++) {
      if (!s.mapTimes[mapId(i)]) {
        s.invalid = true;
        break;
      }
    }
  }
}

function getTimeData(identity: string): OtherTimeStorage {
  const currentStorage = localStorage.getItem(`wildjank:otherTimer-${identity}`);
  if (!currentStorage) return {};
  try {
    const data = JSON.parse(currentStorage) as OtherTimeStorage;
    if (typeof (data) !== "object") throw new Error(`Failed to parse timer values`);
    return data;
  } catch (e) { }
  return {};
}

const ENABLED_KEY = "wildjank-timer-enabled";
const POSITION_KEY = "wildjank-timer-position";
const COLLAPSED_KEY = "wildjank-timer-collapsed";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

let activeTimerRefresh: () => void;
let timerInvalidated = true;

export function installTimer(options: {
  identity: () => string | undefined;
  prestige: () => number | undefined;
  storage: () => Storage | undefined;
}) {
  const read = (key: string) => { try { return options.storage()?.getItem(key) === "true"; } catch { return false; } };
  const write = (key: string, value: boolean) => { try { options.storage()?.setItem(key, String(value)); } catch { /* holds for the session */ } };
  const toggle = document.getElementById("timerToggle");
  const panel = document.createElement("section");
  panel.className = "dps-breakdown";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Timer");
  panel.innerHTML = `<header><button type="button" class="timer-handle"></button></header>`
    + `<table><thead><tr style="position: sticky; top: 0; background: #0003;"><th scope="col">Zone</th><th scope="col">Current Total</th><th scope="col">Current Zone</th><th scope="col">Prev Zone</th><th scope="col">Best Zone</th><th scope="col">Last Zone Split</th><th scope="col">Last Total Split</th><th scope="col">Best Zone Split</th><th scope="col">Best Total Split</th><th scope="col">Last Total</th><th scope="col">Best Total</th></tr></thead><tbody></tbody></table>`;
  document.getElementById("hud")!.append(panel);
  const handle = panel.querySelector<HTMLButtonElement>(".timer-handle")!;
  const table = panel.querySelector("table")!;
  const body = panel.querySelector("tbody")!;
  table.classList.add('zone-timer-table');
  let enabled = read(ENABLED_KEY), collapsed = read(COLLAPSED_KEY);

  function renderCollapsed() {
    panel.classList.toggle("is-collapsed", collapsed);
    handle.setAttribute("aria-expanded", String(!collapsed));
    handle.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} Timer. Double-click or double-tap to lock or unlock position.`);
    handle.textContent = `Timer ${collapsed ? "▸" : "▾"}`;
    movable.place();
  }
  function refresh() {
    const wasHidden = panel.hidden;
    setHidden(panel, !enabled);
    if (!enabled) return;
    if (wasHidden) movable.place();
    if (collapsed) { table.hidden = true; return; } else { table.hidden = false; }
    const identity = options.identity();
    const prestige = options.prestige();
    if (identity === undefined || prestige === undefined) return;
    const data = getTimeData(identity);

    if (!timerInvalidated) return;
    timerInvalidated = false;

    const rows: Node[] = [];
    const max = maxMap(data);
    const mapId = (n: number) => n < CAMPAIGN_MAPS.length ? (CAMPAIGN_MAPS[n]?.id ?? '') : `${PROCEDURAL_PREFIX}${n - 14}`;
    const timestamp = (n: number | undefined, forceHour: boolean) => n === undefined ? `--:--:--` : `${forceHour || n >= (1000 * 60 * 60) ? Math.floor(n / (1000 * 60 * 60)).toString().padStart(2, '0') + ':' : ''}${formatTimerMs(n % (1000 * 60 * 60))}`;

    for (let i = 0; i <= max.index; i++) {
      const map = mapId(i);

      const bestTimeValue = bestTime(data, map, prestige);
      const bestTimePrevValue = bestTime(data, i > 0 ? mapId(i - 1) : '', prestige);
      const zoneTime = i > 0 && data[prestige]?.mapTimes[map] && data[prestige]?.mapTimes[mapId(i - 1)] ? (data[prestige]?.mapTimes[map]?.time - data[prestige]?.mapTimes[mapId(i - 1)].time) : (i == 0 && data[prestige]?.mapTimes[map] ? data[prestige]?.mapTimes[map]?.time : 0);
      const zoneTimeText = zoneTime > 0 ? ` ${timestamp(zoneTime, false)}` : '--:--';
      const bestZoneTime = i > 0 && bestTimeValue && bestTimePrevValue ? bestTimeValue - bestTimePrevValue : (i == 0 && bestTimeValue ? bestTimeValue : 0);
      const bestZoneTimeText = bestZoneTime > 0 ? `${timestamp(bestZoneTime, false)}` : '--:--';
      const timeSplit = bestZoneTime > 0 && zoneTime > 0 ? zoneTime - bestZoneTime : 0;
      const splitText = ` ${timeSplit < 0 ? `-${timestamp(-timeSplit, false)}` : `+${timestamp(timeSplit, false)}`}`;
      //element.textContent = `${map}: ${timestamp(data[prestige]?.mapTimes[map]?.time)}${zoneTimeText} ${splitText} ${timestamp(data[prestige - 1]?.mapTimes[map]?.time)} ${timestamp(bestTime(data, map))}`;
      const mapLabel = MAP_DISPLAY_NAMES[map] ?? `Endless - ${i - 14}`;
      const totalTimeSplit = data[prestige]?.mapTimes[map] && bestTimeValue !== undefined ? data[prestige]?.mapTimes[map].time - bestTimeValue : undefined;
      const totalTimeSplitText = totalTimeSplit !== undefined ? ` ${totalTimeSplit < 0 ? `-${timestamp(-totalTimeSplit, false)}` : `+${timestamp(totalTimeSplit, false)}`}` : '+00:00';
      const previousTime = i > 0 && data[prestige - 1]?.mapTimes[map] && data[prestige - 1]?.mapTimes[mapId(i - 1)] ? data[prestige - 1]?.mapTimes[map].time - data[prestige - 1]?.mapTimes[mapId(i - 1)].time : (data[prestige - 1]?.mapTimes[map] ? data[prestige - 1]?.mapTimes[map].time : 0);
      const previousTimeText = previousTime > 0 ? `${timestamp(previousTime, false)}` : '--:--';
      const previousTimeSplit = previousTime > 0 && zoneTime > 0 ? zoneTime - previousTime : 0;
      const previousSplitText = `${previousTimeSplit < 0 ? `-${timestamp(-previousTimeSplit, false)}` : `+${timestamp(previousTimeSplit, false)}`}`;
      const previousFullTimeSplit = data[prestige]?.mapTimes[map] && data[prestige - 1]?.mapTimes[map] ? data[prestige]?.mapTimes[map].time - data[prestige - 1]?.mapTimes[map].time : 0;
      const previousFullTimeSplitText = `${previousFullTimeSplit < 0 ? `-${timestamp(-previousFullTimeSplit, false)}` : `+${timestamp(previousFullTimeSplit, false)}`}`;


      const row = document.createElement('tr');
      const mapLabelElement = document.createElement('td');
      mapLabelElement.textContent = mapLabel;
      row.appendChild(mapLabelElement);
      const currentPrestigeTimestampElement = document.createElement('td');
      currentPrestigeTimestampElement.textContent = timestamp(data[prestige]?.mapTimes[map]?.time, true);
      row.appendChild(currentPrestigeTimestampElement);
      const currentPrestigeZoneTimeElement = document.createElement('td');
      currentPrestigeZoneTimeElement.textContent = zoneTimeText;
      row.appendChild(currentPrestigeZoneTimeElement);
      const lastPrestigeTimestampElement = document.createElement('td');
      lastPrestigeTimestampElement.textContent = previousTimeText;
      row.appendChild(lastPrestigeTimestampElement);
      const bestZoneTimeElement = document.createElement('td');
      bestZoneTimeElement.textContent = bestZoneTimeText;
      row.appendChild(bestZoneTimeElement);
      const currentZoneSplitElement = document.createElement('td');
      currentZoneSplitElement.textContent = previousSplitText;
      currentZoneSplitElement.classList.add(previousTimeSplit == 0 ? 'grey' : previousTimeSplit > 0 ? 'red' : 'green');
      row.appendChild(currentZoneSplitElement);
      const totalSplitElement = document.createElement('td');
      totalSplitElement.textContent = previousFullTimeSplitText;
      totalSplitElement.classList.add(previousFullTimeSplit == 0 ? 'grey' : previousFullTimeSplit > 0 ? 'red' : 'green');
      row.appendChild(totalSplitElement);
      const bestSplitElement = document.createElement('td');
      bestSplitElement.textContent = splitText;
      bestSplitElement.classList.add(timeSplit == 0 ? 'grey' : timeSplit > 0 ? 'red' : 'green');
      row.appendChild(bestSplitElement);
      const bestTotalSplitElement = document.createElement('td');
      bestTotalSplitElement.textContent = totalTimeSplitText;
      bestTotalSplitElement.classList.add(totalTimeSplit === undefined || totalTimeSplit == 0 ? 'grey' : totalTimeSplit > 0 ? 'red' : 'green');
      row.appendChild(bestTotalSplitElement);
      const lastTotalTimestampElement = document.createElement('td');
      lastTotalTimestampElement.textContent = timestamp(data[prestige - 1]?.mapTimes[map]?.time, true);
      row.appendChild(lastTotalTimestampElement);
      const bestTotalTimestampElement = document.createElement('td');
      bestTotalTimestampElement.textContent = timestamp(bestTimeValue, true);
      row.appendChild(bestTotalTimestampElement);
      rows.push(row);
    }

    body.replaceChildren(...rows);
  }
  function setEnabled(value: boolean) {
    enabled = value;
    write(ENABLED_KEY, value);
    if (toggle) renderBooleanSetting(toggle, value);
    refresh();
  }
  toggle?.addEventListener("click", () => setEnabled(!enabled));
  const movable = installMovableHudCard({
    panel, handle, storage: options.storage, positionKey: POSITION_KEY, lockKey: "wildjank-timer-position-locked", toggle: () => {
      collapsed = !collapsed;
      write(COLLAPSED_KEY, collapsed);
      renderCollapsed();
      refresh();
    }
  });
  //window.setInterval(() => { if (!document.hidden) refresh(); }, 500);
  if (toggle) renderBooleanSetting(toggle, enabled);
  renderCollapsed();
  refresh();
  activeTimerRefresh = refresh;
}
