// Vercel Node.js Function. KMA_KEY는 서버 환경변수에서만 읽는다.
const { SUPABASE_URL, SUPABASE_PUBLIC_KEY } = require('../config.js');
const { judge } = require('../logic.js');

const GRIDS = { 세종: [66, 103], 대전: [67, 100], 태안: [48, 109], 보령: [54, 100] };

function dates(now) {
  const kst = new Date(now.getTime() + 9 * 3600000);
  const today = kst.toISOString().slice(0, 10);
  kst.setUTCDate(kst.getUTCDate() - 1);
  return { today, baseDate: kst.toISOString().slice(0, 10).replace(/-/g, '') };
}

function summarize(items, date) {
  const categories = { TMP: [], WSD: [], POP: [] };
  for (const item of items) {
    if (item.fcstDate !== date.replace(/-/g, '') || !Object.hasOwn(categories, item.category)) continue;
    if (item.fcstValue === '' || item.fcstValue == null) continue;
    const value = Number(item.fcstValue);
    if (Number.isFinite(value)) categories[item.category].push({ time: item.fcstTime, value });
  }
  for (const [category, entries] of Object.entries(categories)) {
    if (new Set(entries.map(entry => entry.time)).size !== 24 ||
        entries.some(entry => category === 'WSD' ? entry.value < 0 :
          category === 'POP' ? entry.value < 0 || entry.value > 100 : false)) {
      throw new Error('Incomplete forecast');
    }
  }
  return {
    tempMax: Math.max(...categories.TMP.map(entry => entry.value)),
    windMax: Math.max(...categories.WSD.map(entry => entry.value)),
    rainProb: Math.max(...categories.POP.map(entry => entry.value)),
  };
}

async function getJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Upstream request failed');
  return response.json();
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'GET 요청만 지원합니다.' });
  }
  const region = req.query?.region;
  if (typeof region !== 'string' || !Object.hasOwn(GRIDS, region)) {
    return res.status(400).json({ error: 'region은 세종, 대전, 태안, 보령 중 하나여야 합니다.' });
  }
  if (!process.env.KMA_KEY || !SUPABASE_URL || !SUPABASE_PUBLIC_KEY) {
    return res.status(500).json({ error: '서버의 KMA_KEY 또는 Supabase 설정을 확인해주세요.' });
  }
  const { today, baseDate } = dates(new Date());
  const taskUrl = new URL('/rest/v1/wx_tasks', SUPABASE_URL);
  taskUrl.search = new URLSearchParams({ select: 'id,title,region,kind,owner', region: 'eq.' + region, order: 'id.asc' });
  let tasks;
  try {
    tasks = await getJson(taskUrl, { headers: { apikey: SUPABASE_PUBLIC_KEY } });
    if (!Array.isArray(tasks) || !tasks.every(task => task.region === region &&
        ['야외', '고소', '실내'].includes(task.kind))) throw new Error('Invalid tasks');
  } catch {
    return res.status(502).json({ error: 'DB 일정을 조회하지 못했습니다.' });
  }
  try {
    let key = process.env.KMA_KEY.trim();
    // 공공데이터포털의 일반 인증키(Decoding/Encoding) 모두 허용.
    if (/%[0-9a-f]{2}/i.test(key)) key = decodeURIComponent(key);
    const url = new URL('https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst');
    url.search = new URLSearchParams({ serviceKey: key, pageNo: '1', numOfRows: '1000',
      dataType: 'JSON', base_date: baseDate, base_time: '2000',
      nx: String(GRIDS[region][0]), ny: String(GRIDS[region][1]) });
    const payload = await getJson(url);
    if (payload.response?.header?.resultCode !== '00') throw new Error('KMA rejected request');
    const weather = summarize(payload.response.body.items.item, today);
    return res.status(200).json({ region, date: today, timezone: 'Asia/Seoul',
      weather: { ...weather, source: '기상청 단기예보', baseDate, baseTime: '2000',
        units: { tempMax: '℃', windMax: 'm/s', rainProb: '%' } },
      tasks: tasks.map(task => ({ ...task, judgment: judge(task.kind, weather) })) });
  } catch {
    return res.status(502).json({ region, date: today, weather: null,
      error: '기상청 예보를 조회하지 못했거나 오늘 전체 시간대의 예보가 없습니다. KMA_KEY와 단기예보 활용신청을 확인해주세요.',
      tasks: tasks.map(task => ({ ...task, judgment: judge(task.kind, null) })) });
  }
}

module.exports = handler;
module.exports.summarize = summarize;
module.exports.dates = dates;
