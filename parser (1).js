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

/* ---------- KHÔNG SUY LUẬN THÔNG SỐ ----------
   Mã model không phải chuẩn thống nhất giữa các hãng nên mọi suy đoán
   dung tích / khối lượng / công suất đều có rủi ro sai.
   Chỉ hiển thị đúng những gì có trong bảng giá.                        */
function specOf(group, model){ return {text:''}; }

/* ---------- SINH CÂU "VÌ SAO CHỌN" ----------
   Chỉ dùng thông tin chắc chắn: nhóm hàng, hãng, phân khúc giá.
   Không nói về dung tích / kích thước / công suất vì bảng giá không có. */
const TIER_WORD={eco:'tiết kiệm', bal:'cân bằng', pre:'cao cấp'};
function reasonOf(group, tier, spec, brand){
  const b = brand ? brand+' ' : '';
  const T={
    tv:`TV ${b}thuộc nhóm ${TIER_WORD[tier]} trong tầm giá bạn chọn — hình ảnh và hệ điều hành ổn định cho nhu cầu xem hằng ngày.`,
    fridge:`Tủ lạnh ${b}thuộc nhóm ${TIER_WORD[tier]} trong tầm giá bạn chọn. Nhân viên tư vấn sẽ xác nhận dung tích phù hợp với số người trong nhà.`,
    washer:`Máy giặt ${b}thuộc nhóm ${TIER_WORD[tier]} trong tầm giá bạn chọn. Khối lượng giặt cụ thể sẽ được tư vấn theo nhu cầu gia đình.`,
    dryer:`Máy sấy ${b}giúp quần áo khô trong ngày, không phụ thuộc thời tiết — rất cần cho mùa nồm ẩm miền Bắc.`,
    ac:`Điều hoà ${b}thuộc nhóm ${TIER_WORD[tier]}. Công suất BTU sẽ được tư vấn theo diện tích phòng thực tế của bạn.`,
    dishwasher:`Máy rửa bát ${b}tiết kiệm khoảng 30 phút mỗi tối, rửa sạch và sấy khô tự động.`,
    robot:`Robot ${b}dọn sàn hằng ngày khi cả nhà đi vắng, phù hợp sàn gỗ và gạch men.`,
    purifier:`Chỉ số AQI Hà Nội thường xuyên ở mức cao — máy lọc ${b}bảo vệ hô hấp cho cả gia đình.`,
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
  return T[group] || `Sản phẩm ${b}thuộc nhóm ${TIER_WORD[tier]} trong tầm giá bạn chọn.`;
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
      ten: (curBrand? curBrand+' ' : '') + rawModel,
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
