import { MapId } from "./world";

type TimeStorage = { [index: string]: { bestTime: number, prestige: number, previousPB?: number } };

export function saveTime(time: number, mapId: MapId, prestige: number, identity: string) {
  const currentStorage = localStorage.getItem(`timerValues-${identity}`);
  console.log(currentStorage);
  if (currentStorage) {
    try {
      const data = JSON.parse(currentStorage) as TimeStorage;
      console.log(data);
      console.log(typeof (data));
      if (typeof (data) !== "object") throw `Failed to parse timer values`;
      const relevantTime = data[mapId];
      console.log(relevantTime);
      if (relevantTime) {
        if (relevantTime.prestige < prestige && relevantTime.bestTime > time) {
          if (relevantTime.previousPB === undefined || relevantTime.bestTime < relevantTime.previousPB) {
            relevantTime.previousPB = relevantTime.bestTime;
          }
          relevantTime.bestTime = time;
        }
      } else {
        data[mapId] = { bestTime: time, prestige: prestige };
      }
      console.log(data);
      console.log(JSON.stringify(data));
      localStorage.setItem(`timerValues-${identity}`, JSON.stringify(data));
      return;
    } catch (e) {

    }
  }
  const data = { [mapId]: { bestTime: time, prestige: prestige } };
  console.log(data);
  console.log(JSON.stringify(data));
  localStorage.setItem(`timerValues-${identity}`, JSON.stringify(data));
  //storage.setItem(`timerValues-${identity}`, currentStorage);
}

export function getTimes(identity: string): Map<MapId, { bestTime: number }> {
  const currentStorage = localStorage.getItem(`timerValues-${identity}`);
  if (currentStorage) {
    try {
      const data = JSON.parse(currentStorage) as Map<MapId, { bestTime: number }>;
      if (typeof (data) !== "object" || typeof (data.get) !== "function") throw `Failed to parse timer values`;
      return data;
    } catch (e) {
    }
  }
  const data = new Map<MapId, { bestTime: number }>();
  return data;
}

export function rollBackTime(mapId: string, identity: string) {
  const currentStorage = localStorage.getItem(`timerValues-${identity}`);
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
