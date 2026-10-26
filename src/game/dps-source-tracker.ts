import { formatCompactNumber } from "../ui/number-format";

const allDamage: { [index: string]: { damage: number } } = {};
let measuredSince = Date.now();
let trackerTurnedOn = true;

export function trackHit(damage: number, source: string) {
  const damageSlot = allDamage[source];
  if (damageSlot) {
    damageSlot.damage += damage;
  } else {
    allDamage[source] = { damage: damage };
  }

  //console.log(Object.keys(allDamage).map((k) => `${k} : ${formatCompactNumber(allDamage[k].damage)}`).join(' | '));
}

export function createDamageSourceTracker() {
  const tracker = document.createElement('section');
  tracker.id = 'damage-source-tracker';
  document.getElementById('hud')!.append(tracker);
  window.setInterval(() => {
    if (!trackerTurnedOn) return;
    renderTracker();
  }, 1000);
}

export function toggleTrackerState(state: boolean) {
  trackerTurnedOn = state;
}

export function resetDamageSourceTracking() {
  measuredSince = Date.now();
  Object.keys(allDamage).forEach(k => allDamage[k].damage = 0);
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = "") {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

function renderTracker() {
  const tracker = document.getElementById('damage-source-tracker');
  if (!tracker) return;
  while (tracker.childNodes.length > 0) tracker.lastChild?.remove();
  const data = Object.keys(allDamage).map((k) => { return ({ key: k, damage: allDamage[k].damage }); }).sort((a, b) => b.damage - a.damage).filter(d => d.damage > 0);
  let totalDamage = 0;
  data.forEach(d => totalDamage += d.damage);
  for (const d of data) {
    const row = document.createElement('div');
    row.classList.add('damageTrackerRow');
    const nameText = d.key;
    const nameTextElement = document.createElement('div');
    nameTextElement.classList.add('damage-source-tracker-name');
    nameTextElement.textContent = nameText;
    row.appendChild(nameTextElement);
    const damageText = `${formatCompactNumber(d.damage / ((Date.now() - measuredSince) / 1000))}`;
    const damageTextElement = document.createElement('div');
    damageTextElement.classList.add('damage-source-tracker-damage');
    damageTextElement.textContent = damageText;
    row.appendChild(damageTextElement);
    const bar = element("span", "damage-source-bar");
    bar.setAttribute("aria-hidden", "true");
    const inner = element("span", "");
    inner.style.width = `${d.damage / totalDamage * 100}%`;
    bar.append(inner);
    tracker.appendChild(row);
    tracker.append(bar);
  }
}
