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
  COL_TAG:   36,  // Cột AK — "Hashtag": ngành hàng (Tivi, Tủ lạnh, Máy giặt...)
  COL_SEG:   37,  // Cột AL — "Phân khúc": Tiết kiệm / Cân bằng / Cao cấp
  SKIP_ROWS: 2    // Bỏ qua 2 dòng tiêu đề ở đầu file
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
  hood:      {ic:'🌪️', name:'Máy hút mùi',         room:'kit',    core:1},
  cooktop:   {ic:'🔥', name:'Bếp từ',              room:'kit',    core:1},
  soundbar:  {ic:'🔊', name:'Loa',                 room:'living', core:1},
  fan:       {ic:'💨', name:'Quạt',                room:'bed',    core:1},
  hotcold:   {ic:'🚰', name:'Cây nước nóng lạnh',  room:'kit',    core:1},
  dehum:     {ic:'🌫️', name:'Máy hút ẩm',          room:'bath',   core:0},
  freezer:   {ic:'🧊', name:'Tủ đông / Tủ mát',    room:'kit',    core:0},
  smallapp:  {ic:'🍳', name:'Gia dụng nhỏ',        room:'kit',    core:0}
};
const ROOMS = {living:'🛋️ Phòng khách', kit:'🍳 Bếp', bed:'🛏️ Phòng ngủ', bath:'🚿 Phòng tắm / Giặt'};

/* ÁNH XẠ HASHTAG (cột AK) → nhóm thiết bị.
   Đây là nguồn phân loại CHÍNH XÁC NHẤT — ưu tiên hơn dòng tiêu đề.
   Khớp không phân biệt hoa thường và dấu tiếng Việt.                    */
const TAG_MAP = {
  'tivi':'tv', 'ti vi':'tv', 'tv':'tv', 'smart tv':'tv',
  'tu lanh':'fridge', 'tulanh':'fridge',
  'tu dong':'freezer', 'tu mat':'freezer',
  'may giat':'washer', 'maygiat':'washer', 'may giat say':'washer',
  'may say':'dryer', 'maysay':'dryer',
  'dieu hoa':'ac', 'dieuhoa':'ac', 'may lanh':'ac', 'dieu hoa 2 chieu':'ac',
  'may rua bat':'dishwasher', 'ruabat':'dishwasher', 'may rua chen':'dishwasher',
  'robot':'robot', 'robot hut bui':'robot', 'hut bui':'robot', 'may hut bui':'robot',
  'loc khong khi':'purifier', 'may loc khong khi':'purifier', 'lockhongkhi':'purifier',
  'loc nuoc':'water', 'may loc nuoc':'water', 'locnuoc':'water',
  'nuoc nong lanh':'hotcold', 'cay nuoc':'hotcold', 'cay nuoc nong lanh':'hotcold',
  'nong lanh':'heater', 'binh nong lanh':'heater', 'binhnonglanh':'heater', 'binh nuoc nong':'heater',
  'hut mui':'hood', 'may hut mui':'hood', 'hutmui':'hood',
  'bep tu':'cooktop', 'bep':'cooktop', 'beptu':'cooktop', 'bep dien':'cooktop', 'bep gas':'cooktop',
  'loa':'soundbar', 'soundbar':'soundbar', 'loa thanh':'soundbar', 'am thanh':'soundbar',
  'quat':'fan', 'quat dieu hoa':'fan',
  'hut am':'dehum', 'may hut am':'dehum',
  'gia dung':'smallapp', 'noi chien':'smallapp', 'lo vi song':'smallapp', 'lo nuong':'smallapp'
};
/* ÁNH XẠ PHÂN KHÚC (cột AL) */
const SEG_MAP = {
  'tiet kiem':'eco', 'tietkiem':'eco', 'gia re':'eco', 'pho thong':'eco',
  'can bang':'bal', 'canbang':'bal', 'trung cap':'bal', 'tam trung':'bal', 'tot':'bal',
  'cao cap':'pre', 'caocap':'pre', 'premium':'pre', 'flagship':'pre'
};

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

/* ---------- TỰ DÒ VỊ TRÍ CỘT THEO TÊN TIÊU ĐỀ ----------
   An toàn hơn cố định A/S/Y/AK/AL: nếu Sheet chèn hoặc xoá cột,
   hệ thống vẫn tìm đúng nhờ khớp tên ở dòng tiêu đề.            */
const COL_HINTS = {
  COL_PRICE: ['co lap dat','gia lap dat','gia ban','gia co lap dat'],
  COL_STOCK: ['tin phat ton','ton tin phat','ton kho','tp ton'],
  COL_TAG:   ['hashtag','hash tag','nganh hang','loai hang'],
  COL_SEG:   ['phan khuc','phankhuc','segment']
};
function detectColumns(rows, cfg){
  const found = {};
  const scan = Math.min(6, rows.length);
  for(let r=0; r<scan; r++){
    const row = rows[r] || [];
    for(let c=0; c<row.length; c++){
      const cell = noAccent(row[c]);
      if(!cell) continue;
      for(const key in COL_HINTS){
        if(found[key]!==undefined) continue;
        if(COL_HINTS[key].some(h => cell===h || cell.indexOf(h)>=0)){
          found[key] = c;
        }
      }
    }
    if(Object.keys(found).length === Object.keys(COL_HINTS).length) break;
  }
  /* Dòng dữ liệu bắt đầu ngay sau dòng tiêu đề tìm thấy */
  let headerRow = -1;
  for(let r=0; r<scan; r++){
    const row = rows[r] || [];
    if(row.some(c => {
      const x = noAccent(c);
      return x === 'co lap dat' || x === 'hashtag' || x.indexOf('tin phat ton')>=0;
    })){ headerRow = r; break; }
  }
  const out = Object.assign({}, cfg);
  for(const k in found) out[k] = found[k];
  if(headerRow >= 0) out.SKIP_ROWS = headerRow + 1;
  out._detected = found;
  out._headerRow = headerRow;
  return out;
}

/* ---------- NHẬN DIỆN DÒNG TIÊU ĐỀ NHÓM ---------- */
/* VD: "Tivi Aqua" → {group:'tv', brand:'Aqua'} */
function detectHeader(text){
  const t=noAccent(text);
  if(!t||t.length>60)return null;
  for(const [kw,g] of KEYWORDS){
    /* Chỉ khớp trọn từ: "Tivi" hoặc "Tivi Aqua".
       KHÔNG dùng startsWith(kw) trần vì mã như "TVS-501" sẽ bị hiểu nhầm. */
    if(t===kw || t.startsWith(kw+' ')){
      let brand=String(text).trim().slice(kw.length).trim().replace(/^[-–—:]\s*/,'');
      /* Tên hãng hợp lệ: không chứa số, không quá dài, tối đa 3 từ.
         Loại bỏ trường hợp phần còn lại thực chất là MÃ MÁY (VD "2514DV3B"). */
      if(!isBrandName(brand)) brand='';
      return {group:g, brand:brand};
    }
  }
  return null;
}
/* Kiểm tra một chuỗi có phải tên hãng không */
function isBrandName(b){
  if(!b) return false;
  if(b.length>22) return false;
  if(/\d/.test(b)) return false;              /* có số → là mã máy */
  if(b.split(/\s+/).length>3) return false;   /* quá nhiều từ */
  return true;
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
/* Tra nhóm từ Hashtag (cột AK) — nguồn chính xác nhất */
function groupFromTag(tag){
  const t = noAccent(tag);
  if(!t) return null;
  if(TAG_MAP[t]) return TAG_MAP[t];
  /* khớp mềm: hashtag chứa từ khoá */
  let best=null, bl=0;
  for(const k in TAG_MAP){
    if((t===k || t.indexOf(k)>=0) && k.length>bl){best=TAG_MAP[k]; bl=k.length;}
  }
  return best;
}
/* Tra phân khúc từ cột AL */
function segFromCell(v){
  const t = noAccent(v);
  if(!t) return null;
  if(SEG_MAP[t]) return SEG_MAP[t];
  for(const k in SEG_MAP){ if(t.indexOf(k)>=0) return SEG_MAP[k]; }
  return null;
}

function buildCatalog(rows, cfg){
  cfg = detectColumns(rows, Object.assign({}, CONFIG, cfg||{}));
  const products=[];
  const log={total:0, header:0, noPrice:0, noGroup:0, ok:0, inStock:0,
             headers:[], byTag:0, byHeader:0, tagsUnknown:{}, segFromSheet:0,
             cols:{model:cfg.COL_MODEL, stock:cfg.COL_STOCK, price:cfg.COL_PRICE,
                   tag:cfg.COL_TAG, seg:cfg.COL_SEG, skip:cfg.SKIP_ROWS},
             detected:cfg._detected||{}, headerRow:cfg._headerRow,
             rowsTotal:rows.length, colsTotal:(rows[0]||[]).length,
             skipSample:[], priceEmpty:0};
  let curGroup=null, curBrand='';

  for(let i=cfg.SKIP_ROWS;i<rows.length;i++){
    const r=rows[i];
    if(!r||!r.length)continue;
    const rawModel=String(r[cfg.COL_MODEL]||'').trim();
    if(!rawModel)continue;
    log.total++;

    const price = num(r[cfg.COL_PRICE]);
    const stock = num(r[cfg.COL_STOCK]);
    const tag   = String(r[cfg.COL_TAG]||'').trim();
    const seg   = String(r[cfg.COL_SEG]||'').trim();

    /* Dòng tiêu đề nhóm: có chữ ở cột A, KHÔNG có giá và KHÔNG có hashtag.
       Dòng nào đã có hashtag chắc chắn là sản phẩm nên không xét làm tiêu đề. */
    if(!price){
      const h = tag ? null : detectHeader(rawModel);
      if(h){
        curGroup=h.group; curBrand=h.brand;
        log.header++; log.headers.push({text:rawModel, group:h.group, brand:h.brand});
      } else {
        log.noPrice++;
        if(log.skipSample.length<25)
          log.skipSample.push({row:i+1, a:rawModel,
            y:String(r[cfg.COL_PRICE]||''), ak:String(r[cfg.COL_TAG]||'')});
      }
      continue;
    }

    /* ƯU TIÊN 1: Hashtag cột AK — chính xác nhất, tránh nhầm ngành hàng */
    let group = groupFromTag(tag);
    if(group){ log.byTag++; }
    else {
      /* ƯU TIÊN 2: dòng tiêu đề gần nhất phía trên */
      group = curGroup;
      if(group){ log.byHeader++; }
      if(tag) log.tagsUnknown[tag]=(log.tagsUnknown[tag]||0)+1;
    }
    if(!group){ log.noGroup++; continue; }
    if(!GROUPS[group]){ log.noGroup++; continue; }

    /* Chỉ gán hãng khi dòng tiêu đề gần nhất CÙNG NHÓM với sản phẩm.
       Tránh việc một tiêu đề TV làm hỏng tên của toàn bộ máy giặt bên dưới. */
    const brand = (curGroup===group) ? curBrand : '';

    /* Phân khúc: ưu tiên cột AL, nếu trống sẽ tính theo phân vị giá sau */
    const pkSheet = segFromCell(seg);
    if(pkSheet) log.segFromSheet++;

    products.push({
      nhom: group,
      model: rawModel,
      hang: brand,
      ten: (brand? brand+' ' : '') + rawModel,
      gia: price,
      ton: stock>0 ? 1 : 0,
      giaTon: stock,
      tag: tag,
      pk: pkSheet,          /* null nếu Sheet chưa điền */
      _pkSheet: !!pkSheet,
      ts: '',
      mota: '',             /* mô tả ngắn — bổ sung sau theo hashtag */
      _row: i+1
    });
    log.ok++; if(stock>0)log.inStock++;
  }

  /* Bổ sung phân khúc cho các mã Sheet chưa điền — tính theo phân vị giá trong nhóm */
  const byGroup={};
  products.forEach(p=>(byGroup[p.nhom]??=[]).push(p));
  Object.values(byGroup).forEach(list=>{
    const prices=list.map(p=>p.gia).sort((a,b)=>a-b);
    const q=(t)=>prices[Math.floor((prices.length-1)*t)];
    const p33=q(0.34), p66=q(0.67);
    list.forEach(p=>{
      if(!p.pk){
        p.pk = prices.length<3 ? 'bal' : (p.gia<=p33 ? 'eco' : p.gia>p66 ? 'pre' : 'bal');
      }
      p.mota = p.mota || descOf(p);
      p.ld = reasonOf(p.nhom, p.pk, {}, p.hang);
    });
  });

  return {products, log, groups:Object.keys(byGroup)};
}

/* Mô tả ngắn hiển thị dưới tên sản phẩm.
   Hiện sinh từ hashtag + phân khúc; sẽ thay bằng cột mô tả riêng khi Sheet bổ sung. */
function descOf(p){
  const SEG={eco:'Phổ thông', bal:'Cân bằng', pre:'Cao cấp'};
  const parts=[];
  if(p.tag) parts.push(p.tag);
  if(p.pk && SEG[p.pk]) parts.push(SEG[p.pk]);
  if(p.hang) parts.push(p.hang);
  return parts.join(' · ');
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

return {CONFIG, GROUPS, ROOMS, KEYWORDS, TAG_MAP, SEG_MAP, COL_HINTS, detectColumns,
        load, parseCSV, buildCatalog,
        num, noAccent, detectHeader, isBrandName, specOf, groupFromTag, segFromCell};
})();
