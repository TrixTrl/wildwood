import { CAMPAIGN_MAPS } from "../../shared/campaign-registry";
import { PROCEDURAL_PREFIX } from "../../shared/procedural-map-core";
import { formatTimerMs } from "../../shared/timer-format";
import { MapId } from "./world";

const TIMER_VALUES = 11;
const OFFSET = 4;
const HISTORY_SIZE = 3;

type TimeStorage = { [index: string]: { bestTime: number, prestige: number, previousPB?: number, allTimes: Array<{ prestige: number, time: number }> } };

let lastChangedMap: MapId | undefined;

export function saveTime(time: number, mapId: MapId, prestige: number, identity: string) {
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
      timer.textContent = labelText(mapId(realCentre - OFFSET + i)) + (realCentre - OFFSET + i === mapIndex ? ` <--` : ``);
    }
  }
}
