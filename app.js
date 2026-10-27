// app.js – 화면 동작 (목록 그리기, 일정 추가)

let taskDb = null;
let savingTask = false;
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
    const { data, error } = await taskDb.from('wx_tasks')
      .select('id,title,region,kind,owner').order('id', { ascending: true });
    if (error) throw error;
    if (!Array.isArray(data) || !data.every(isTask)) throw new Error('일정 형식 오류');
    tasks = data;
    msg.textContent = '';
    return true;
  } catch (error) {
    msg.textContent = '일정을 불러오지 못했습니다. Supabase 연결 정보와 setup.sql 실행 여부를 확인한 뒤 새로고침해주세요.';
    return false;
  } finally {
    renderTasks();
  }
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

async function addTask(e) {
  e.preventDefault();
  if (!taskDb || savingTask) return;
  const t = {
    title: document.getElementById('titleInput').value.trim(),
    region: document.getElementById('regionInput').value,
    kind: document.getElementById('kindInput').value,
    owner: document.getElementById('ownerInput').value.trim(),
  };
  if (!isTask(t)) return;
  const button = document.querySelector('#taskForm button');
  savingTask = true;
  button.disabled = true;
  document.getElementById('msgBox').textContent = '저장 중…';
  try {
    const { data, error } = await taskDb.from('wx_tasks').insert(t)
      .select('id,title,region,kind,owner').single();
    if (error || !isTask(data)) throw error || new Error('저장 응답 오류');
    tasks.push(data);
    e.target.reset();
    renderTasks();
    document.getElementById('msgBox').textContent = '일정을 저장했습니다.';
  } catch (error) {
    document.getElementById('msgBox').textContent = '저장 완료를 확인하지 못했습니다. 입력은 유지됩니다. 새로고침해 등록 여부를 확인한 뒤 다시 시도해주세요.';
  } finally {
    savingTask = false;
    button.disabled = false;
  }
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

function downloadMarkdown() {
  const rows = Array.from(document.querySelectorAll('#taskList tr'), tr =>
    Array.from(tr.cells, cell => cell.textContent));
  const now = new Date();
  const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')].join('-');
  const testWind = new URLSearchParams(window.location.search).get('test') === 'wind';
  const markdown = createJudgmentMarkdown(rows, date, testWind);
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = '현장일정_판단_' + date + '.md';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function initialize() {
  const button = document.querySelector('#taskForm button');
  button.disabled = true;
  loadWeather();
  try {
    if (typeof SUPABASE_URL !== 'string' || !SUPABASE_URL ||
        typeof SUPABASE_PUBLIC_KEY !== 'string' || !SUPABASE_PUBLIC_KEY) {
      throw new Error('config.js에 Supabase 주소와 공개용 키를 입력해주세요.');
    }
    if (!window.supabase) throw new Error('supabase-js를 불러오지 못했습니다. 네트워크 연결을 확인해주세요.');
    taskDb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    if (await loadTasks()) {
      button.disabled = false;
      document.getElementById('downloadMarkdown').disabled = false;
    }
  } catch (error) {
    document.getElementById('msgBox').textContent = error.message;
  }
}

document.getElementById('taskForm').addEventListener('submit', addTask);
document.getElementById('downloadMarkdown').addEventListener('click', downloadMarkdown);
initialize();
