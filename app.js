// app.js – 화면 동작 (목록 그리기, 일정 추가)

let baseTasks = [];
let addedTasks = [];
let tasks = [];
let weatherByRegion = {};

async function loadWeather() {
  const box = document.getElementById('weatherBox');
  const testWind = new URLSearchParams(window.location.search).get('test') === 'wind';
  box.textContent = '오늘 날씨를 불러오는 중…' + (testWind ? ' (강풍 테스트 모드)' : '');
  const results = await Promise.all(Object.keys(REGIONS).map(async (region) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(buildWeatherUrl(region), { signal: controller.signal });
      if (!response.ok) throw new Error('날씨 요청 실패: ' + response.status);
      const w = parseWeather(await response.json());
      weatherByRegion[region] = testWind ? { ...w, windMax: 12 } : w;
      renderTasks();
      return { region, ok: true };
    } catch (error) {
      return { region, ok: false };
    } finally {
      clearTimeout(timeout);
    }
  }));
  const failed = results.filter(result => !result.ok).map(result => result.region);
  box.textContent = (failed.length
    ? '날씨를 가져오지 못한 지역: ' + failed.join(', ') + '. 새로고침하여 다시 시도하세요.'
    : '오늘 날씨 수신 완료 (한국 시간 기준).') +
    ' 표시 순서: 최고 기온(℃) · 최대 풍속(m/s) · 최대 강수확률(%).' +
    (testWind ? ' 강풍 테스트 모드: 수신한 날씨의 풍속을 12m/s로 적용합니다.' : '');
  const source = document.createElement('a');
  source.href = 'https://open-meteo.com/';
  source.textContent = '날씨 제공: Open-Meteo';
  box.appendChild(document.createTextNode(' '));
  box.appendChild(source);
}

function isTask(t) {
  return t && ['title', 'region', 'kind', 'owner'].every(key =>
    typeof t[key] === 'string' && t[key].trim()) &&
    Object.hasOwn(REGIONS, t.region) && ['야외', '고소', '실내'].includes(t.kind);
}

async function loadTasks() {
  const msg = document.getElementById('msgBox');
  try {
    const response = await fetch('data/tasks.json');
    if (!response.ok) throw new Error('일정 요청 실패');
    const data = await response.json();
    if (!Array.isArray(data) || !data.every(isTask)) throw new Error('일정 형식 오류');
    baseTasks = data;
  } catch (error) {
    msg.textContent = '배포주소로열어주세요';
  }
  // 기본 JSON을 먼저 읽은 뒤, 화면에서 추가한 일정만 합친다.
  try {
    const saved = JSON.parse(localStorage.getItem('wx_added') || '[]');
    if (!Array.isArray(saved) || !saved.every(isTask)) throw new Error('저장 형식 오류');
    addedTasks = saved;
  } catch (error) {
    msg.textContent += (msg.textContent ? ' · ' : '') + '추가 일정을 불러오지 못했습니다.';
  }
  tasks = baseTasks.concat(addedTasks);
  renderTasks();
}

function weatherText(w) {
  return w ? w.tempMax + '℃ · ' + w.windMax + 'm/s · ' + w.rainProb + '%' : '-';
}

function renderTasks() {
  const body = document.getElementById('taskList');
  body.innerHTML = '';
  for (const t of tasks) {
    const w = weatherByRegion[t.region];
    const r = judge(t.kind, w);
    const tr = document.createElement('tr');
    for (const v of [t.title, t.region, t.kind, t.owner, weatherText(w)]) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    }
    const td = document.createElement('td');
    td.textContent = r.text;
    td.className = r.level;
    tr.appendChild(td);
    body.appendChild(tr);
  }
}

function addTask(e) {
  e.preventDefault();
  const t = {
    title: document.getElementById('titleInput').value.trim(),
    region: document.getElementById('regionInput').value,
    kind: document.getElementById('kindInput').value,
    owner: document.getElementById('ownerInput').value.trim(),
  };
  if (!t.title || !t.owner) return;
  const nextAdded = addedTasks.concat(t);
  try {
    localStorage.setItem('wx_added', JSON.stringify(nextAdded));
  } catch (error) {
    document.getElementById('msgBox').textContent = '일정을 저장하지 못했습니다. 브라우저 저장소 설정을 확인해주세요.';
    return;
  }
  addedTasks = nextAdded;
  tasks = baseTasks.concat(addedTasks);
  e.target.reset();
  renderTasks();
}

const today = new Date();
const todayText = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, '0'),
  String(today.getDate()).padStart(2, '0'),
].join('-');
const todayDate = document.getElementById('todayDate');
todayDate.textContent = todayText;
todayDate.dateTime = todayText;

async function initialize() {
  const button = document.querySelector('#taskForm button');
  button.disabled = true;
  await loadTasks();
  button.disabled = false;
  loadWeather();
}

document.getElementById('taskForm').addEventListener('submit', addTask);
initialize();
