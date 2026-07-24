/* ===================================================================
   TÍN PHÁT AI — Bộ đọc bảng giá Google Sheet (CSV)
   Dùng chung cho index.html (khách hàng) và admin.html (quản trị)
   =================================================================== */
window.TP = (function () {

/* ---------- CẤU HÌNH — sửa ở đây nếu bố cục Sheet thay đổi ---------- */
const CONFIG = {
  CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTI4a_2Ou_aXn9rKobCjdUKHhVtXKFmr3F_9nbmIZfQE2BI7N_J3hWHMwZw9NPJw9qMB-WJ2md-L0bP/pub?gid=0&single=true&output=csv',
  COL_MODEL: 0,   // Cột A  — Mã model / dòng tiêu đề nhóm hàng
  COL_STOCK: 18,  // Cột S  — "Tín Phát tồn": có giá = còn tồn kho
  COL_PRICE: 24,  // Cột Y  — "Có lắp đặt": giá bán cuối cùng cho khách
  SKIP_ROWS: 1    // Bỏ qua số dòng tiêu đề ở đầu file
};

/* ---------- NHÓM THIẾT BỊ ---------- */
const GROUPS = {
  tv:        {ic:'📺', name:'TV',                  room:'living', core:1},
  fridge:    {ic:'🧊', name:'Tủ lạnh',             room:'kit',    core:1},
  washer:    {ic:'🌀', name:'Máy giặt',            room:'bath',   core:1},
  dryer:     {ic:'☀️', name:'Máy sấy',             room:'bath',   core:1},
  ac:        {ic:'❄️', name:'Điều hoà',            room:'bed',    core:1},
  dishwasher:{ic:'🍽️', name:'Máy rửa bát',         room:'kit',    core:1},
  robot:     {ic:'🤖', name:'Robot hút bụi',       room:'living', core:1},
  purifier:  {ic:'🌬️', name:'Máy lọc không khí',   room:'bed',    core:1},
  water:     {ic:'💧', name:'Máy lọc nước',        room:'kit',    core:1},
  heater:    {ic:'🚿', name:'Bình nóng lạnh',      room:'bath',   core:1},
  dehum:     {ic:'🌫️', name:'Máy hút ẩm',          room:'bath',   core:0},
  freezer:   {ic:'🧊', name:'Tủ đông / Tủ mát',    room:'kit',    core:0},
  hood:      {ic:'🌪️', name:'Máy hút mùi',         room:'kit',    core:0},
  cooktop:   {ic:'🔥', name:'Bếp từ / Bếp gas',    room:'kit',    core:0},
  soundbar:  {ic:'🔊', name:'Loa / Soundbar',      room:'living', core:0},
  fan:       {ic:'💨', name:'Quạt',                room:'living', core:0},
  smallapp:  {ic:'🍳', name:'Gia dụng nhỏ',        room:'kit',    core:0}
};
const ROOMS = {living:'🛋️ Phòng khách', kit:'🍳 Bếp', bed:'🛏️ Phòng ngủ', bath:'🚿 Phòng tắm / Giặt'};

/* Từ khoá nhận diện nhóm — thứ tự quan trọng, cụ thể trước, chung sau */
const KEYWORDS = [
  ['may rua bat','dishwasher'], ['may rua chen','dishwasher'],
  ['may loc khong khi','purifier'], ['loc khong khi','purifier'],
  ['may loc nuoc','water'], ['loc nuoc','water'], ['nuoc nong lanh','water'],
  ['may hut am','dehum'], ['hut am','dehum'],
  ['may hut mui','hood'], ['hut mui','hood'],
  ['binh nong lanh','heater'], ['nong lanh','heater'], ['binh nuoc nong','heater'],
  ['robot hut bui','robot'], ['robot','robot'], ['hut bui','robot'],
  ['may giat say','washer'], ['may giat','washer'], ['thap giat say','washer'],
  ['may say','dryer'],
  ['tu dong','freezer'], ['tu mat','freezer'], ['tu bao quan','freezer'],
  ['tu lanh','fridge'],
  ['dieu hoa','ac'], ['dieu hoa 2 chieu','ac'], ['may lanh','ac'],
  ['soundbar','soundbar'], ['loa thanh','soundbar'], ['loa','soundbar'],
  ['bep tu','cooktop'], ['bep dien','cooktop'], ['bep gas','cooktop'], ['bep','cooktop'],
  ['quat dieu hoa','fan'], ['quat','fan'],
  ['noi chien','smallapp'], ['lo vi song','smallapp'], ['lo nuong','smallapp'],
  ['may ep','smallapp'], ['may xay','smallapp'], ['am sieu toc','smallapp'], ['gia dung','smallapp'],
  ['tivi','tv'], ['ti vi','tv'], ['tv','tv'], ['smart tv','tv']
];

/* ---------- TIỆN ÍCH ---------- */
/* Bỏ dấu tiếng Việt để so khớp từ khoá */
function noAccent(s){
  return String(s||'').toLowerCase()
    .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g,'a').replace(/[èéẹẻẽêềếệểễ]/g,'e')
    .replace(/[ìíịỉĩ]/g,'i').replace(/[òóọỏõôồốộổỗơờớợởỡ]/g,'o')
    .replace(/[ùúụủũưừứựửữ]/g,'u').replace(/[ỳýỵỷỹ]/g,'y').replace(/đ/g,'d')
    .replace(/\s+/g,' ').trim();
}
/* "6.350" → 6350 · "13.100" → 13100 · "hh"/"" → 0 */
function num(v){
  if(v===null||v===undefined)return 0;
  let s=String(v).trim();
  if(!s)return 0;
  s=s.replace(/\.(?=\d{3}(\D|$))/g,'').replace(/,/g,'').replace(/[^\d.\-]/g,'');
  const n=parseFloat(s);
  return isFinite(n)&&n>0?n:0;
}
/* Phân tích CSV chuẩn RFC4180 (xử lý dấu phẩy & xuống dòng trong ô) */
function parseCSV(text){
  const rows=[]; let row=[], f='', q=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){
      if(c==='"'){ if(text[i+1]==='"'){f+='"';i++} else q=false }
      else f+=c;
    } else {
      if(c==='"')q=true;
      else if(c===','){row.push(f);f=''}
      else if(c==='\n'){row.push(f);rows.push(row);row=[];f=''}
      else if(c==='\r'){}
      else f+=c;
    }
  }
  if(f!==''||row.length){row.push(f);rows.push(row)}
  return rows;
}

/* ---------- NHẬN DIỆN DÒNG TIÊU ĐỀ NHÓM ---------- */
/* VD: "Tivi Aqua" → {group:'tv', brand:'Aqua'} */
function detectHeader(text){
  const t=noAccent(text);
  if(!t||t.length>60)return null;
  for(const [kw,g] of KEYWORDS){
    if(t===kw||t.startsWith(kw+' ')||t.startsWith(kw)){
      const brand=String(text).trim().slice(kw.length).trim()
        .replace(/^[-–—:]\s*/,'');
      return {group:g, brand:brand||''};
    }
  }
  return null;
}
/* Dòng model thật thường có chữ + số, không có khoảng trắng dài */
function looksLikeModel(text){
  const t=String(text).trim();
  if(!t||t.length>42)return false;
  return /\d/.test(t) && !/^(tivi|tu lanh|may|dieu hoa|robot|bep|loa|quat|binh)/.test(noAccent(t));
}

/* ---------- SUY LUẬN THÔNG SỐ TỪ MÃ MODEL ---------- */
function specOf(group, model){
  const m=String(model).toUpperCase();
  if(group==='tv'){
    const r=m.match(/(?:^|[^\d])(3[2-9]|[4-8]\d|9[0-8]|100)(?=[^\d]|$)/);
    if(r)return {inch:+r[1], text:r[1]+' inch'};
  }
  if(group==='fridge'||group==='freezer'){
    /* Ưu tiên số ghi rõ lít: "380L" */
    let r=m.match(/([1-9]\d{2})\s*L\b/);
    if(r)return {lit:+r[1], text:r[1]+'L'};
    /* Samsung RT22/RT29/RT38 · RF48/RF59 → 2 số đầu ≈ dung tích (feet → lít) */
    r=m.match(/^R[TFSB](\d{2})/);
    if(r){const L=Math.round(+r[1]*10.2/10)*10; return {lit:L, text:'~'+L+'L'};}
    /* LG GN-D332 / GR-B256 → 3 số giữa */
    r=m.match(/^G[NR][-\s]?[A-Z](\d{3})/);
    if(r)return {lit:+r[1], text:'~'+r[1]+'L'};
    /* Aqua AQR-T220 · Toshiba RT400 */
    r=m.match(/(?:^|[^\d])([1-8]\d{2})(?=[^\d]|$)/);
    if(r&&+r[1]>=90)return {lit:+r[1], text:r[1]+'L'};
  }
  if(group==='washer'||group==='dryer'){
    let r=m.match(/(\d{1,2}(?:[.,]\d)?)\s*KG\b/);
    if(r)return {kg:+String(r[1]).replace(',','.'), text:r[1]+'kg'};
    /* LG FV1410 / FV1412 / FV1414 → 2 số sau "FV14" là khối lượng */
    r=m.match(/^F[VXR]\d{2}(\d{2})/);
    if(r&&+r[1]>=7&&+r[1]<=25)return {kg:+r[1], text:r[1]+'kg'};
    /* Samsung WW90/WW10TP · WD14 → 2 số sau 2 chữ cái */
    r=m.match(/^W[WDF](\d{2})/);
    if(r){const k=+r[1]>=70?Math.round(+r[1]/10):+r[1];
      if(k>=7&&k<=25)return {kg:k, text:k+'kg'};}
    /* Electrolux EWF1142 / EDV804 */
    r=m.match(/^E[WDV][A-Z]?(\d{2})/);
    if(r){const k=+r[1]>=70?Math.round(+r[1]/10):+r[1];
      if(k>=7&&k<=25)return {kg:k, text:k+'kg'};}
    r=m.match(/(?:^|[^\d])([7-9]|1\d|2[0-5])(?=KG|[^\d]|$)/);
    if(r)return {kg:+r[1], text:r[1]+'kg'};
  }
  if(group==='ac'){
    let r=m.match(/\b(9|12|18|24)0{3}\b/);
    if(r)return {btu:+r[1]*1000, text:(+r[1]*1000)+' BTU'};
    /* Daikin FTKB25 / FTKY35 / FTKB50 · mã số = công suất kW×10 */
    r=m.match(/^F[TVBK][A-Z]{1,2}(\d{2})/);
    if(r){const kw=+r[1]; const map={25:9000,26:9000,35:12000,34:12000,50:18000,60:21000,71:24000};
      const b=map[kw]; if(b)return {btu:b, text:b.toLocaleString('vi-VN')+' BTU'};}
    /* Panasonic CU/CS-PU9AKH · LG V10API */
    r=m.match(/(?:^|[^\d])(9|10|12|13|18|24)(?=[A-Z]|$)/);
    if(r){const b={9:9000,10:9000,12:12000,13:12000,18:18000,24:24000}[+r[1]];
      if(b)return {btu:b, text:b.toLocaleString('vi-VN')+' BTU'};}
  }
  return {text:''};
}

/* ---------- SINH CÂU "VÌ SAO CHỌN" ---------- */
const TIER_WORD={eco:'tiết kiệm', bal:'cân bằng', pre:'cao cấp'};
function reasonOf(group, tier, spec, brand){
  const b=brand?brand+' ':'';
  if(group==='tv'&&spec.inch){
    const d=(spec.inch*0.046).toFixed(1).replace('.',',');
    return `${spec.inch}" phù hợp khoảng cách xem khoảng ${d}m — tỷ lệ chuẩn để xem 4K không mỏi mắt.`;
  }
  if((group==='fridge')&&spec.lit){
    const ng=Math.max(1,Math.round(spec.lit/90));
    return `${spec.lit}L tương đương khoảng ${ng} người dùng — đủ trữ thực phẩm tươi cho 4–5 ngày.`;
  }
  if(group==='washer'&&spec.kg){
    return `${spec.kg}kg giặt được chăn ga gối đệm, phù hợp tần suất giặt 2 ngày/lần.`;
  }
  if(group==='dryer'&&spec.kg){
    return `${spec.kg}kg sấy khô trong ngày — rất cần cho mùa nồm ẩm miền Bắc tháng 2–4.`;
  }
  if(group==='ac'&&spec.btu){
    const m2={9000:'12–15',12000:'15–20',18000:'25–30',24000:'35–40'}[spec.btu]||'—';
    return `${spec.btu} BTU phù hợp phòng khoảng ${m2}m², chạy đúng tải nên tiết kiệm điện.`;
  }
  const T={
    tv:`Mẫu ${b}phân khúc ${TIER_WORD[tier]}, hình ảnh và hệ điều hành ổn định cho nhu cầu xem hằng ngày.`,
    fridge:`Tủ lạnh ${b}phân khúc ${TIER_WORD[tier]}, công nghệ Inverter vận hành êm và bền.`,
    washer:`Máy giặt ${b}phân khúc ${TIER_WORD[tier]}, giặt sạch ổn định với chi phí điện nước hợp lý.`,
    dryer:`Máy sấy ${b}giúp quần áo khô trong ngày, không phụ thuộc thời tiết.`,
    ac:`Điều hoà ${b}phân khúc ${TIER_WORD[tier]}, làm lạnh nhanh và tiết kiệm điện.`,
    dishwasher:`Máy rửa bát ${b}tiết kiệm khoảng 30 phút mỗi tối, rửa sạch và sấy khô tự động.`,
    robot:`Robot ${b}dọn sàn hằng ngày khi cả nhà đi vắng, phù hợp sàn gỗ và gạch men.`,
    purifier:`Chỉ số AQI Hà Nội thường xuyên ở mức cao — máy lọc ${b}bảo vệ hô hấp cả gia đình.`,
    water:`Máy lọc ${b}cho nước uống trực tiếp, lắp gọn dưới gầm tủ bếp.`,
    heater:`Bình nóng lạnh ${b}cấp nước nóng ổn định, an toàn chống giật.`,
    dehum:`Máy hút ẩm ${b}xử lý nồm ẩm miền Bắc, giữ quần áo và tường nhà luôn khô.`,
    freezer:`Tủ đông ${b}trữ thực phẩm số lượng lớn, phù hợp gia đình đông người.`,
    hood:`Máy hút mùi ${b}khử mùi dầu mỡ, giữ không gian bếp thoáng sạch.`,
    cooktop:`Bếp ${b}gia nhiệt nhanh, an toàn và dễ vệ sinh.`,
    soundbar:`Loa ${b}nâng chất lượng âm thanh cho phòng khách, kết nối nhanh với TV.`,
    fan:`Quạt ${b}vận hành êm, tiết kiệm điện cho những ngày chuyển mùa.`,
    smallapp:`Thiết bị ${b}tiện dụng cho căn bếp hiện đại.`
  };
  return T[group]||`Sản phẩm ${b}phân khúc ${TIER_WORD[tier]}, phù hợp nhu cầu sử dụng của gia đình.`;
}

/* ---------- XÂY DANH MỤC TỪ CÁC DÒNG CSV ---------- */
function buildCatalog(rows, cfg){
  cfg = Object.assign({}, CONFIG, cfg||{});
  const products=[];
  const log={total:0, header:0, noPrice:0, noGroup:0, ok:0, inStock:0, headers:[]};
  let curGroup=null, curBrand='';

  for(let i=cfg.SKIP_ROWS;i<rows.length;i++){
    const r=rows[i];
    if(!r||!r.length)continue;
    const rawModel=String(r[cfg.COL_MODEL]||'').trim();
    if(!rawModel)continue;
    log.total++;

    const price=num(r[cfg.COL_PRICE]);
    const stock=num(r[cfg.COL_STOCK]);

    /* Dòng tiêu đề nhóm: có chữ ở cột A nhưng không có giá */
    if(!price){
      const h=detectHeader(rawModel);
      if(h){
        curGroup=h.group; curBrand=h.brand;
        log.header++; log.headers.push({text:rawModel, group:h.group, brand:h.brand});
      } else {
        log.noPrice++;
      }
      continue;
    }

    /* Dòng sản phẩm nhưng chưa xác định được nhóm */
    if(!curGroup){ log.noGroup++; continue; }

    const spec=specOf(curGroup, rawModel);
    products.push({
      nhom: curGroup,
      model: rawModel,
      hang: curBrand,
      ten: (curBrand? curBrand+' ' : '') + rawModel + (spec.text? ' — '+spec.text : ''),
      gia: price,
      ton: stock>0 ? 1 : 0,
      giaTon: stock,
      ts: spec.text,
      _spec: spec,
      _row: i+1
    });
    log.ok++; if(stock>0)log.inStock++;
  }

  /* Tự phân khúc theo phân vị giá trong từng nhóm */
  const byGroup={};
  products.forEach(p=>(byGroup[p.nhom]??=[]).push(p));
  Object.values(byGroup).forEach(list=>{
    const prices=list.map(p=>p.gia).sort((a,b)=>a-b);
    const q=(t)=>prices[Math.floor((prices.length-1)*t)];
    const p33=q(0.34), p66=q(0.67);
    list.forEach(p=>{
      p.pk = prices.length<3 ? 'bal' : (p.gia<=p33 ? 'eco' : p.gia>p66 ? 'pre' : 'bal');
      p.ld = reasonOf(p.nhom, p.pk, p._spec, p.hang);
      delete p._spec;
    });
  });

  return {products, log, groups:Object.keys(byGroup)};
}

/* ---------- TẢI DỮ LIỆU ---------- */
async function load(cfg){
  cfg = Object.assign({}, CONFIG, cfg||{});
  const url = cfg.CSV_URL + (cfg.CSV_URL.includes('?')?'&':'?') + '_=' + Date.now();
  const res = await fetch(url);
  if(!res.ok) throw new Error('Không tải được bảng giá (HTTP '+res.status+')');
  const text = await res.text();
  const rows = parseCSV(text);
  if(rows.length<3) throw new Error('Bảng giá trống hoặc sai định dạng');
  return buildCatalog(rows, cfg);
}

return {CONFIG, GROUPS, ROOMS, KEYWORDS, load, parseCSV, buildCatalog, num, noAccent, detectHeader, specOf};
})();
