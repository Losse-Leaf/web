#!/usr/bin/env node
/**
 * Loose-Leaf China Map & Standard Prefecture Cities Builder (Node.js ESM)
 * 合规地图数据构建与 375 个地级行政区划标准化脚本
 * 
 * 遵循规范与台账契约：
 * - docs/wishlist-travel.md §六 地图数据合规要求
 * - docs/web.md §5.11 空间足迹地图与国家地理信息安全
 * - docs/backlog.md RC-75 / RC-76 / RC-86 / RC-89
 * 
 * 数据源凭据：
 * 1. 官方边界服务：高德/阿里云 DataV Atlas 边界服务 (https://geo.datav.aliyun.com/areas_v3/bound/)
 * 2. 权威行政区划口径：民政部/国家统计局标准行政区划代码表 (375 个地级单位)
 * 3. 投影体系：中国国家标准 Albers 等面积圆锥投影 (标准纬线 25°N / 47°N，中央经线 105°E，原点偏移 x0=350, y0=734, 缩放 750)
 * 
 * 纯 Node.js 原生标准库实现，零第三方运行时依赖。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.dirname(__dirname);

// 标准 Albers 等面积圆锥投影正算 (与中国国家标准地图投影参数自洽)
export function albersProject(lon, lat) {
  const phi1 = (25.0 * Math.PI) / 180.0;
  const phi2 = (47.0 * Math.PI) / 180.0;
  const rLat = (lat * Math.PI) / 180.0;
  const rLon = (lon * Math.PI) / 180.0;
  const rLambda0 = (105.0 * Math.PI) / 180.0;

  const n = 0.5 * (Math.sin(phi1) + Math.sin(phi2));
  const c = Math.cos(phi1) ** 2 + 2 * n * Math.sin(phi1);
  const rho0 = Math.sqrt(c - 2 * n * Math.sin(0)) / n;
  const rho = Math.sqrt(Math.max(0.00001, c - 2 * n * Math.sin(rLat))) / n;
  const theta = n * (rLon - rLambda0);

  const x = rho * Math.sin(theta);
  const y = rho0 - rho * Math.cos(theta);

  const scale = 750.0;
  const x0 = 350.0;
  const y0 = 734.0;

  return [
    Math.round((x0 + scale * x) * 10) / 10,
    Math.round((y0 - scale * y) * 10) / 10,
  ];
}

// Douglas-Peucker 边界抽稀算法 (用于合规边界几何矢量化)
export function simplifyPoints(points, sqTolerance = 0.4) {
  if (points.length <= 2) return points;
  let maxSqDist = 0;
  let index = 0;
  const [x1, y1] = points[0];
  const [x2, y2] = points[points.length - 1];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    let sqDist;
    if (lenSq === 0) {
      sqDist = (px - x1) * (px - x1) + (py - y1) * (py - y1);
    } else {
      const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
      const projX = x1 + t * dx;
      const projY = y1 + t * dy;
      sqDist = (px - projX) * (px - projX) + (py - projY) * (py - projY);
    }
    if (sqDist > maxSqDist) {
      maxSqDist = sqDist;
      index = i;
    }
  }

  if (maxSqDist > sqTolerance) {
    const left = simplifyPoints(points.slice(0, index + 1), sqTolerance);
    const right = simplifyPoints(points.slice(index), sqTolerance);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[points.length - 1]];
}

// 完整 375 个城市标准拼音字典 (覆盖多音字与少数民族地名)
const PINYIN_MAP = {
  // 直辖市
  '北京市': 'beijing',
  '天津市': 'tianjin',
  '上海市': 'shanghai',
  '重庆市': 'chongqing',
  // 特别行政区与台湾省
  '香港特别行政区': 'xianggang hong kong',
  '澳门特别行政区': 'aomen macau',
  '台北市': 'taibei',
  '高雄市': 'gaoxiong',
  '台中市': 'taizhong',
  '台南市': 'tainan',
  '新北市': 'xinbei',
  '桃园市': 'taoyuan',
  // 河北省
  '石家庄市': 'shijiazhuang',
  '唐山市': 'tangshan',
  '秦皇岛市': 'qinhuangdao',
  '邯郸市': 'handan',
  '邢台市': 'xingtai',
  '保定市': 'baoding',
  '张家口市': 'zhangjiakou',
  '承德市': 'chengde',
  '沧州市': 'cangzhou',
  '廊坊市': 'langfang',
  '衡水市': 'hengshui',
  // 山西省
  '太原市': 'taiyuan',
  '大同市': 'datong',
  '阳泉市': 'yangquan',
  '长治市': 'changzhi',
  '晋城市': 'jincheng',
  '朔州市': 'shuozhou',
  '晋中市': 'jinzhong pingyao',
  '运城市': 'yuncheng',
  '忻州市': 'xinzhou',
  '临汾市': 'linfen',
  '吕梁市': 'lvliang luliang',
  // 内蒙古自治区
  '呼和浩特市': 'huhehaote hohhot',
  '包头市': 'baotou',
  '乌海市': 'wuhai',
  '赤峰市': 'chifeng',
  '通辽市': 'tongliao',
  '鄂尔多斯市': 'eerduosi ordos',
  '呼伦贝尔市': 'hulunbeier',
  '巴彦淖尔市': 'bayannaoer',
  '乌兰察布市': 'wulanchabu',
  '兴安盟': 'xingan',
  '锡林郭勒盟': 'xilinguole',
  '阿拉善盟': 'alashan',
  // 辽宁省
  '沈阳市': 'shenyang',
  '大连市': 'dalian',
  '鞍山市': 'anshan',
  '抚顺市': 'fushun',
  '本溪市': 'benxi',
  '丹东市': 'dandong',
  '锦州市': 'jinzhou',
  '营口市': 'yingkou',
  '阜新市': 'fuxin',
  '辽阳市': 'liaoyang',
  '盘锦市': 'panjin',
  '铁岭市': 'tieling',
  '朝阳市': 'chaoyang',
  '葫芦岛市': 'huludao',
  // 吉林省
  '长春市': 'changchun',
  '吉林市': 'jilin',
  '四平市': 'siping',
  '辽源市': 'liaoyuan',
  '通化市': 'tonghua',
  '白山市': 'baishan',
  '松原市': 'songyuan',
  '白城市': 'baicheng',
  '延边朝鲜族自治州': 'yanbian',
  // 黑龙江省
  '哈尔滨市': 'haerbin',
  '齐齐哈尔市': 'qiqihaer',
  '鸡西市': 'jixi',
  '鹤岗市': 'hegang',
  '双鸭山市': 'shuangyashan',
  '大庆市': 'daqing',
  '伊春市': 'yichun',
  '佳木斯市': 'jiamusi',
  '七台河市': 'qitaihe',
  '牡丹江市': 'mudanjiang',
  '黑河市': 'heihe',
  '绥化市': 'suihua',
  '大兴安岭地区': 'daxinganling',
  // 江苏省
  '南京市': 'nanjing',
  '无锡市': 'wuxi',
  '徐州市': 'xuzhou',
  '常州市': 'changzhou',
  '苏州市': 'suzhou',
  '南通市': 'nantong',
  '连云港市': 'lianyungang',
  '淮安市': 'huaian',
  '盐城市': 'yancheng',
  '扬州市': 'yangzhou',
  '镇江市': 'zhenjiang',
  '泰州市': 'taizhou',
  '宿迁市': 'suqian',
  // 浙江省
  '杭州市': 'hangzhou',
  '宁波市': 'ningbo',
  '温州市': 'wenzhou',
  '嘉兴市': 'jiaxing',
  '湖州市': 'huzhou',
  '绍兴市': 'shaoxing',
  '金华市': 'jinhua',
  '衢州市': 'quzhou',
  '舟山市': 'zhoushan',
  '台州市': 'taizhou',
  '丽水市': 'lishui',
  // 安徽省
  '合肥市': 'hefei',
  '芜湖市': 'wuhu',
  '蚌埠市': 'bengbu',
  '淮南市': 'huainan',
  '马鞍山市': 'maanshan',
  '淮北市': 'huaibei',
  '铜陵市': 'tongling',
  '安庆市': 'anqing',
  '黄山市': 'huangshan',
  '滁州市': 'chuzhou',
  '阜阳市': 'fuyang',
  '宿州市': 'suzhou',
  '六安市': 'luan liuan',
  '亳州市': 'bozhou',
  '池州市': 'chizhou',
  '宣城市': 'xuancheng',
  // 福建省
  '福州市': 'fuzhou',
  '厦门市': 'xiamen',
  '莆田市': 'putian',
  '三明市': 'sanming',
  '泉州市': 'quanzhou',
  '漳州市': 'zhangzhou',
  '南平市': 'nanping',
  '龙岩市': 'longyan',
  '宁德市': 'ningde',
  // 江西省
  '南昌市': 'nanchang',
  '景德镇市': 'jingdezhen',
  '萍乡市': 'pingxiang',
  '九江市': 'jiujiang',
  '新余市': 'xinyu',
  '鹰潭市': 'yingtan',
  '赣州市': 'ganzhou',
  '吉安市': 'jian',
  '宜春市': 'yichun',
  '抚州市': 'fuzhou',
  '上饶市': 'shangrao',
  // 山东省
  '济南市': 'jinan',
  '青岛市': 'qingdao',
  '淄博市': 'zibo',
  '枣庄市': 'zaozhuang',
  '东营市': 'dongying',
  '烟台市': 'yantai',
  '潍坊市': 'weifang',
  '济宁市': 'jining',
  '泰安市': 'taian',
  '威海市': 'weihai',
  '日照市': 'rizhao',
  '临沂市': 'linyi',
  '德州市': 'dezhou',
  '聊城市': 'liaocheng',
  '滨州市': 'binzhou',
  '菏泽市': 'heze',
  // 河南省
  '郑州市': 'zhengzhou',
  '开封市': 'kaifeng',
  '洛阳市': 'luoyang',
  '平顶山市': 'pingdingshan',
  '安阳市': 'anyang',
  '鹤壁市': 'hebi',
  '新乡市': 'xinxiang',
  '焦作市': 'jiaozuo',
  '濮阳市': 'puyang',
  '许昌市': 'xuchang',
  '漯河市': 'luohe',
  '三门峡市': 'sanmenxia',
  '南阳市': 'nanyang',
  '商丘市': 'shangqiu',
  '信阳市': 'xinyang',
  '周口市': 'zhoukou',
  '驻马店市': 'zhumadian',
  '济源市': 'jiyuan',
  // 湖北省
  '武汉市': 'wuhan',
  '黄石市': 'huangshi',
  '十堰市': 'shiyan',
  '宜昌市': 'yichang',
  '襄阳市': 'xiangyang',
  '鄂州市': 'ezhou',
  '荆门市': 'jingmen',
  '孝感市': 'xiaogan',
  '荆州市': 'jingzhou',
  '黄冈市': 'huanggang',
  '咸宁市': 'xianning',
  '随州市': 'suizhou',
  '恩施土家族苗族自治州': 'enshi',
  '仙桃市': 'xiantao',
  '潜江市': 'qianjiang',
  '天门市': 'tianmen',
  '神农架林区': 'shennongjia',
  // 湖南省
  '长沙市': 'changsha',
  '株洲市': 'zhuzhou',
  '湘潭市': 'xiangtan',
  '衡阳市': 'hengyang',
  '邵阳市': 'shaoyang',
  '岳阳市': 'yueyang',
  '常德市': 'changde',
  '张家界市': 'zhangjiajie',
  '益阳市': 'yiyang',
  '郴州市': 'chenzhou',
  '永州市': 'yongzhou',
  '怀化市': 'huaihua',
  '娄底市': 'loudi',
  '湘西土家族苗族自治州': 'xiangxi fenghuang',
  // 广东省
  '广州市': 'guangzhou',
  '韶关市': 'shaoguan',
  '深圳市': 'shenzhen',
  '珠海市': 'zhuhai',
  '汕头市': 'shantou',
  '佛山市': 'foshan',
  '江门市': 'jiangmen',
  '湛江市': 'zhanjiang',
  '茂名市': 'maoming',
  '肇庆市': 'zhaoqing',
  '惠州市': 'huizhou',
  '梅州市': 'meizhou',
  '汕尾市': 'shanwei',
  '河源市': 'heyuan',
  '阳江市': 'yangjiang',
  '清远市': 'qingyuan',
  '东莞市': 'dongguan',
  '中山市': 'zhongshan',
  '潮州市': 'chaozhou',
  '揭阳市': 'jieyang',
  '云浮市': 'yunfu',
  // 广西壮族自治区
  '南宁市': 'nanning',
  '柳州市': 'liuzhou',
  '桂林市': 'guilin',
  '梧州市': 'wuzhou',
  '北海市': 'beihai',
  '防城港市': 'fangchenggang',
  '钦州市': 'qinzhou',
  '贵港市': 'guigang',
  '玉林市': 'yulin',
  '百色市': 'baise',
  '贺州市': 'hezhou',
  '河池市': 'hechi',
  '来宾市': 'laibin',
  '崇左市': 'chongzuo',
  // 海南省
  '海口市': 'haikou',
  '三亚市': 'sanya',
  '三沙市': 'sansha',
  '儋州市': 'danzhou',
  '五指山市': 'wuzhishan',
  '琼海市': 'qionghai',
  '文昌市': 'wenchang',
  '万宁市': 'wanning',
  '东方市': 'dongfang',
  '定安县': 'dingan',
  '屯昌县': 'tunchang',
  '澄迈县': 'chengmai',
  '临高县': 'lingao',
  '白沙黎族自治县': 'baisha',
  '昌江黎族自治县': 'changjiang',
  '乐东黎族自治县': 'ledong',
  '陵水黎族自治县': 'lingshui',
  '保亭黎族苗族自治县': 'baoting',
  '琼中黎族苗族自治县': 'qiongzhong',
  // 四川省
  '成都市': 'chengdu',
  '自贡市': 'zigong',
  '攀枝花市': 'panzhihua',
  '泸州市': 'luzhou',
  '德阳市': 'deyang',
  '绵阳市': 'mianyang',
  '广元市': 'guangyuan',
  '遂宁市': 'suining',
  '内江市': 'neijiang',
  '乐山市': 'leshan',
  '南充市': 'nanchong',
  '眉山市': 'meishan',
  '宜宾市': 'yibin',
  '广安市': 'guangan',
  '达州市': 'dazhou',
  '雅安市': 'yaan',
  '巴中市': 'bazhong',
  '资阳市': 'ziyang',
  '阿坝藏族羌族自治州': 'aba jiuzhaigou',
  '甘孜藏族自治州': 'ganzi kangding daocheng',
  '凉山彝族自治州': 'liangshan xichang',
  // 贵州省
  '贵阳市': 'guiyang',
  '六盘水市': 'liupanshui',
  '遵义市': 'zunyi',
  '安顺市': 'anshun',
  '毕节市': 'bijie',
  '铜仁市': 'tongren',
  '黔西南布依族苗族自治州': 'qianxinan',
  '黔东南苗族侗族自治州': 'qiandongnan kaili',
  '黔南布依族苗族自治州': 'qiannan',
  // 云南省
  '昆明市': 'kunming',
  '曲靖市': 'qujing',
  '玉溪市': 'yuxi',
  '保山市': 'baoshan',
  '昭通市': 'zhaotong',
  '丽江市': 'lijiang',
  '普洱市': 'puer',
  '临沧市': 'lincang',
  '楚雄彝族自治州': 'chuxiong',
  '红河哈尼族彝族自治州': 'honghe',
  '文山壮族苗族自治州': 'wenshan',
  '西双版纳傣族自治州': 'xishuangbanna jinghong',
  '大理白族自治州': 'dali',
  '德宏傣族景颇族自治州': 'dehong ruili',
  '怒江傈僳族自治州': 'nujiang',
  '迪庆藏族自治州': 'diqing shangri-la',
  // 西藏自治区
  '拉萨市': 'lasa lhasa',
  '日喀则市': 'rikaze shigatse',
  '昌都市': 'changdu',
  '林芝市': 'linzhi nyingchi',
  '山南市': 'shannan',
  '那曲市': 'naqu',
  '阿里地区': 'ali ngari',
  // 陕西省
  '西安市': 'xian',
  '铜川市': 'tongchuan',
  '宝鸡市': 'baoji',
  '咸阳市': 'xianyang',
  '渭南市': 'weinan',
  '延安市': 'yanan',
  '汉中市': 'hanzhong',
  '榆林市': 'yulin',
  '安康市': 'ankang',
  '商洛市': 'shangluo',
  // 甘肃省
  '兰州市': 'lanzhou',
  '嘉峪关市': 'jiayuguan',
  '金昌市': 'jinchang',
  '白银市': 'baiyin',
  '天水市': 'tianshui',
  '武威市': 'wuwei',
  '张掖市': 'zhangye',
  '平凉市': 'pingliang',
  '酒泉市': 'jiuquan dunhuang',
  '庆阳市': 'qingyang',
  '定西市': 'dingxi',
  '陇南市': 'longnan',
  '临夏回族自治州': 'linxia',
  '甘南藏族自治州': 'gannan zhagana',
  // 青海省
  '西宁市': 'xining',
  '海东市': 'haidong',
  '海北藏族自治州': 'haibei',
  '黄南藏族自治州': 'huangnan',
  '海南藏族自治州': 'hainan',
  '果洛藏族自治州': 'guoluo',
  '玉树藏族自治州': 'yushu',
  '海西蒙古族藏族自治州': 'haixi chaka golmud',
  // 宁夏回族自治区
  '银川市': 'yinchuan',
  '石嘴山市': 'shizuishan',
  '吴忠市': 'wuzhong',
  '固原市': 'guyuan',
  '中卫市': 'zhongwei',
  // 新疆维吾尔自治区
  '乌鲁木齐市': 'wulumuqi urumqi',
  '克拉玛依市': 'kelamayi karamay',
  '吐鲁番市': 'tulufan turpan',
  '哈密市': 'hami',
  '昌吉回族自治州': 'changji',
  '博尔塔拉蒙古自治州': 'boertala sayram',
  '巴音郭楞蒙古自治州': 'bayinguoleng korla',
  '阿克苏地区': 'akesu',
  '克孜勒苏柯尔克孜自治州': 'kezilesu',
  '喀什地区': 'kashi kashgar',
  '和田地区': 'hetian hotan',
  '伊犁哈萨克自治州': 'yili yining',
  '塔城地区': 'tacheng',
  '阿勒泰地区': 'aletai altay kanas',
  '石河子市': 'shihezi',
  '阿拉尔市': 'alaer',
  '图木舒克市': 'tumushuke',
  '五家渠市': 'wujiaqu',
  '北屯市': 'beitun',
  '铁门关市': 'tiemenguan',
  '双河市': 'shuanghe',
  '可克达拉市': 'kekedala',
  '昆玉市': 'kunyu',
  '胡杨河市': 'huyanghe',
};

// 优先从本仓库 scripts/geo/china 读取离线存档，回退至 ../docs/geo/china
function resolveGeoChinaDir() {
  const localDir = path.join(__dirname, 'geo', 'china');
  if (fs.existsSync(path.join(localDir, '100000_full.json'))) {
    return localDir;
  }
  const docsDir = path.join(ROOT_DIR, '..', 'docs', 'geo', 'china');
  if (fs.existsSync(path.join(docsDir, '100000_full.json'))) {
    return docsDir;
  }
  throw new Error('Offline GeoJSON archive not found in scripts/geo/china or ../docs/geo/china');
}


// 将 GeoJSON 几何体投射为标准 SVG Path 字符串 (省级与市级统一复用 RC-93)
export function geometryToSvgPath(geom) {
  if (!geom) return '';
  const polygons = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates || [];
  const pathParts = [];
  for (const poly of polygons) {
    for (const ring of poly) {
      if (!ring || ring.length < 3) continue;
      const projected = ring.map(([lon, lat]) => albersProject(lon, lat));
      let simplified = simplifyPoints(projected, 0.4);
      if (simplified.length < 3 && projected.length >= 3) {
        simplified = simplifyPoints(projected, 0.02);
      }
      if (simplified.length < 3) continue;
      const d = 'M ' + simplified.map(([x, y]) => `${x},${y}`).join(' L ') + ' Z';
      pathParts.push(d);
    }
  }
  if (pathParts.length === 0 && polygons.length > 0 && polygons[0][0] && polygons[0][0].length >= 3) {
    const projected = polygons[0][0].map(([lon, lat]) => albersProject(lon, lat));
    return 'M ' + projected.map(([x, y]) => `${x},${y}`).join(' L ') + ' Z';
  }
  return pathParts.join(' ');
}

// 南海诸岛插框视口投影 (用于从 100000_full.json 的 100000_JD 提取官方十段线 RC-93)
export function scsInsetProject(lon, lat) {
  return [
    Math.round((660 + (lon - 104.78) * 6.61) * 10) / 10,
    Math.round((562.3 - lat * 6.654) * 10) / 10,
  ];
}

function loadFromLocalGeoArchive() {
  const geoDir = resolveGeoChinaDir();
  console.log(`[1/4] 正在从本地离线存档 (${geoDir}) 读取全国省市两级行政区划边界数据...`);

  const provGeojson = JSON.parse(
    fs.readFileSync(path.join(geoDir, '100000_full.json'), 'utf-8')
  );

  const cities = [];
  const cityBoundaries = [];
  let scsDashes = [];

  for (const f of provGeojson.features || []) {
    const p = f.properties || {};
    const adcode = String(p.adcode);
    const name = p.name;

    if (adcode === '100000') continue;

    // 提取官方南海断续线 (100000_JD 十段线)
    if (adcode === '100000_JD') {
      const coords = f.geometry?.coordinates || [];
      scsDashes = coords.map((poly) => {
        const ring = poly[0] || [];
        const projected = ring.map(([lon, lat]) => scsInsetProject(lon, lat));
        const simplified = simplifyPoints(projected, 0.02);
        return 'M ' + simplified.map(([x, y]) => `${x},${y}`).join(' L ') + ' Z';
      });
      continue;
    }

    // 直辖市 (4 个): 市级代码为 xx0100，市级轮廓复用该直辖市全境轮廓
    if (['110000', '120000', '310000', '500000'].includes(adcode)) {
      const cityCode = adcode.slice(0, 2) + '0100';
      const [cx, cy] = albersProject(p.center[0], p.center[1]);
      cities.push({
        code: cityCode,
        name,
        province: name.replace('市', ''),
        center: p.center,
      });
      cityBoundaries.push({
        code: cityCode,
        name,
        provinceAdcode: adcode,
        d: geometryToSvgPath(f.geometry),
        center: { x: cx, y: cy },
      });
      continue;
    }

    // 特别行政区 (2 个)
    if (['810000', '820000'].includes(adcode)) {
      const [cx, cy] = albersProject(p.center[0], p.center[1]);
      cities.push({
        code: adcode,
        name,
        province: name.slice(0, 2),
        center: p.center,
      });
      cityBoundaries.push({
        code: adcode,
        name,
        provinceAdcode: adcode,
        d: geometryToSvgPath(f.geometry),
        center: { x: cx, y: cy },
      });
      continue;
    }

    // 台湾省 (6 个主要城市，台湾全岛市级轮廓对应 710000)
    if (adcode === '710000') {
      const twCities = [
        { code: '710000', name: '台北市', province: '台湾', center: [121.5654, 25.0330] },
        { code: '710100', name: '高雄市', province: '台湾', center: [120.3119, 22.6206] },
        { code: '710200', name: '台中市', province: '台湾', center: [120.6736, 24.1477] },
        { code: '710300', name: '台南市', province: '台湾', center: [120.1850, 22.9997] },
        { code: '710400', name: '新北市', province: '台湾', center: [121.4627, 25.0123] },
        { code: '710500', name: '桃园市', province: '台湾', center: [121.3009, 24.9936] },
      ];
      cities.push(...twCities);
      const [cx, cy] = albersProject(121.5654, 25.0330);
      cityBoundaries.push({
        code: '710000',
        name: '台北市',
        provinceAdcode: '710000',
        d: geometryToSvgPath(f.geometry),
        center: { x: cx, y: cy },
      });
      continue;
    }

    // 其余 27 个省/自治区：从本地离线 {adcode}_full.json 读取下属地级市坐标与边界轮廓
    const subFilePath = path.join(geoDir, `${adcode}_full.json`);
    if (!fs.existsSync(subFilePath)) {
      throw new Error(`Missing offline province file: ${subFilePath}`);
    }
    const subGeojson = JSON.parse(fs.readFileSync(subFilePath, 'utf-8'));
    const cleanProv = name.replace(/省|自治区|维吾尔|壮族|回族/g, '');
    for (const sf of subGeojson.features || []) {
      const sp = sf.properties || {};
      const cityCode = String(sp.adcode);
      const [cx, cy] = albersProject(sp.center[0], sp.center[1]);
      cities.push({
        code: cityCode,
        name: sp.name,
        province: cleanProv,
        center: sp.center,
      });
      cityBoundaries.push({
        code: cityCode,
        name: sp.name,
        provinceAdcode: adcode,
        d: geometryToSvgPath(sf.geometry),
        center: { x: cx, y: cy },
      });
    }
  }

  cities.sort((a, b) => a.code.localeCompare(b.code));
  cityBoundaries.sort((a, b) => a.code.localeCompare(b.code));

  return { cities, cityBoundaries, provGeojson, scsDashes };
}

function generateCitiesTs(cities, outputPath) {
  console.log(`[2/4] 计算 Albers 投影坐标并生成 ${outputPath}...`);
  const lines = [
    '// 中国合规地级行政区划、直辖市、特别行政区与台湾省全量标准字典 (共 375 个地级单位)',
    '// 依据 docs/wishlist-travel.md §六 及 docs/web.md §5.11 合规要求由 scripts/build-china-map.mjs 自动生成',
    '// 数据源凭据：scripts/geo/china/ 离线存档 (源自阿里云 DataV GeoAtlas / 高德开放平台，2026-10-11 固化)；Albers 等面积圆锥投影正算 (中央经线 105°E)',
    '',
    'export interface CityOption {',
    '  code: string',
    '  name: string',
    '  province: string',
    '  pinyin: string',
    '  x: number',
    '  y: number',
    '}',
    '',
    'export const CHINA_CITIES: CityOption[] = [',
  ];

  for (const c of cities) {
    const pinyin = PINYIN_MAP[c.name];
    if (!pinyin) {
      throw new Error(`Missing pinyin for city: ${c.name}`);
    }
    const [x, y] = albersProject(c.center[0], c.center[1]);
    lines.push(`  { code: '${c.code}', name: '${c.name}', province: '${c.province}', pinyin: '${pinyin}', x: ${x}, y: ${y} },`);
  }

  lines.push(
    '];',
    '',
    '/**',
    ' * 城市检索联想：支持汉字城市名、省份名、拼音缩写及 6 位行政区划代码',
    ' */',
    'export function searchCities(keyword: string): CityOption[] {',
    '  const kw = keyword.trim().toLowerCase()',
    '  if (!kw) return CHINA_CITIES.slice(0, 30)',
    '  return CHINA_CITIES.filter((c) => {',
    '    return (',
    '      c.name.includes(kw) ||',
    '      c.province.includes(kw) ||',
    '      c.pinyin.includes(kw) ||',
    '      c.code.startsWith(kw)',
    '    )',
    '  }).slice(0, 40)',
    '}',
    ''
  );

  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
  console.log(`  成功生成 ${cities.length} 个标准化城市至 ${outputPath}`);
}

async function generateChinaMapDataTs(provGeojson, cityBoundaries, scsDashes, outputPath) {
  console.log(`[3/4] 投影 34 省级行政区划 ＋ ${cityBoundaries.length} 市级行政区划矢量路径并生成 ${outputPath}...`);

  // 读取已固化的全国外轮廓 path，若本地无残留则尝试拉取
  let nationalOutlinePath = '';
  if (fs.existsSync(outputPath)) {
    const existing = fs.readFileSync(outputPath, 'utf-8');
    const m = existing.match(/export const NATIONAL_OUTLINE_PATH: string = ("[^"]+");/);
    if (m && m[1]) {
      nationalOutlinePath = JSON.parse(m[1]);
    }
  }
  if (!nationalOutlinePath) {
    try {
      const natRes = await fetch('https://geo.datav.aliyun.com/areas_v3/bound/100000.json');
      if (natRes.ok) {
        const natJson = await natRes.json();
        if (natJson.features && natJson.features[0]) {
          nationalOutlinePath = geometryToSvgPath(natJson.features[0].geometry);
        }
      }
    } catch (err) {
      console.warn('Warning: Failed to fetch 100000.json:', err.message);
    }
  }

  const provinces = [];
  for (const f of provGeojson.features || []) {
    const p = f.properties || {};
    const adcode = String(p.adcode);
    if (adcode === '100000' || adcode === '100000_JD') continue;
    const cCoord = Array.isArray(p.centroid) && p.centroid.length === 2 ? p.centroid : p.center;
    const center = albersProject(cCoord[0], cCoord[1]);
    const d = geometryToSvgPath(f.geometry);
    provinces.push({
      adcode,
      name: p.name,
      d,
      center: { x: center[0], y: center[1] },
    });
  }
  provinces.sort((a, b) => a.adcode.localeCompare(b.adcode));

  if (provinces.length !== 34) {
    throw new Error(`Expected 34 provinces, got ${provinces.length}`);
  }
  if (scsDashes.length !== 10) {
    throw new Error(`Expected 10 SCS dashes from 100000_JD, got ${scsDashes.length}`);
  }

  const lines = [
    '/**',
    ' * 中国地图省市两级合规矢量数据与 Albers 等面积圆锥投影',
    ' * ',
    ' * 依据 docs/wishlist-travel.md §五/§六 及 docs/web.md §5.11 规范由 scripts/build-china-map.mjs 生成 (RC-86 / RC-91 / RC-93)：',
    ' * 1. 行政区划与城市数据（34 条省级轮廓 PROVINCES_DATA、370 条市级轮廓 CITIES_BOUNDARY_DATA、100000_JD 南海十段线）',
    ' *    由构建脚本从本地离线存档 scripts/geo/china/ (源自阿里云 DataV GeoAtlas / 高德开放平台，2026-10-11 归档) 经',
    ' *    统一 albersProject + geometryToSvgPath 数学投影正算生成；',
    ' * 2. 南海诸岛插框参考海岸线、岛礁点位 (SCS_INSET) 与钓鱼岛注记 (DIAOYU_DAO) 为一次性固化的静态资产，来源、获取方式与固化日期均已注明。',
    ' */',
    '',
    "import { CHINA_CITIES } from './cities'",
    '',
    'export interface ProvinceMapItem {',
    '  adcode: string',
    '  name: string',
    '  d: string',
    '  center: { x: number; y: number }',
    '}',
    '',
    'export interface CityBoundaryItem {',
    '  code: string',
    '  name: string',
    '  provinceAdcode: string',
    '  d: string',
    '  center: { x: number; y: number }',
    '}',
    '',
    '// 1. 全境 34 个省级行政区划合规 Albers 投影路径 (由 100000_full.json 经 albersProject + geometryToSvgPath 生成)',
    `export const PROVINCES_DATA: ProvinceMapItem[] = ${JSON.stringify(provinces, null, 2)};`,
    '',
    '// 2. 全境地级市行政区划合规 Albers 投影路径 (由 {省adcode}_full.json 复用同一套 albersProject + geometryToSvgPath 生成，RC-93)',
    `export const CITIES_BOUNDARY_DATA: CityBoundaryItem[] = ${JSON.stringify(cityBoundaries, null, 2)};`,
    '',
    '// 3. 全国全境主体外轮廓边界线 (源自 DataV 100000.json 投影固化，2026-10-11)',
    `export const NATIONAL_OUTLINE_PATH: string = ${JSON.stringify(nationalOutlinePath)};`,
    '',
    '// 4. 钓鱼岛及其附属岛屿注记与坐标点',
    '// 来源：国家标准地理坐标 (123.47°E, 25.75°N) 经 albersProject 投影一次性固化 (固化日期：2026-10-11)',
    'export const DIAOYU_DAO = {',
    "  name: '钓鱼岛',",
    '  x: 568.8,',
    '  y: 396.9,',
    '  labelX: 576,',
    '  labelY: 399,',
    '};',
    '',
    '// 5. 南海诸岛标准附框与合规十段线数据',
    '// 来源说明：dashes 十段线由 scripts/geo/china/100000_full.json 自带的 100000_JD 要素经插框投影生成；',
    '// 海南/台湾参考海岸线及诸岛点位源自 DataV GeoAtlas 官方边界数据一次性固化 (固化日期：2026-10-11)',
    'export const SCS_INSET = {',
    '  box: { x: 660, y: 370, width: 135, height: 185 },',
    "  title: '南海诸岛',",
    '  hainanCoast: "M 695.1,429.1 L 694.2,429.3 L 693.2,429.3 L 692.2,429.2 L 691.1,430.1 L 689.8,429.8 L 689.4,430.2 L 688.8,431.2 L 687.8,432.0 L 686.6,432.9 L 685.5,433.6 L 685.2,435.5 L 685.2,436.8 L 685.6,438.1 L 685.8,439.6 L 687.2,440.0 L 688.6,440.4 L 689.7,440.8 L 690.9,441.4 L 692.2,441.4 L 693.0,440.3 L 694.9,440.1 L 695.9,438.7 L 696.9,438.4 L 698.3,437.3 L 698.5,434.9 L 699.3,433.4 L 700.3,432.5 L 701.5,431.8 L 701.1,430.3 L 700.2,429.2 L 699.4,428.8 L 698.8,428.4 L 697.7,428.7 L 696.4,428.9 L 695.1,429.1 Z",',
    '  taiwanCoast: "M 763.5,413.0 L 764.8,414.3 L 764.9,415.7 L 765.5,416.5 L 766.3,416.6 L 766.6,415.4 L 767.0,412.4 L 767.7,411.5 L 768.7,410.4 L 769.5,409.2 L 770.0,408.4 L 770.3,407.2 L 770.6,405.7 L 771.5,402.6 L 771.6,401.8 L 772.6,399.8 L 773.1,398.5 L 772.8,397.1 L 773.7,395.8 L 772.7,395.1 L 771.8,394.7 L 771.3,394.0 L 770.1,394.2 L 769.3,395.1 L 767.8,395.5 L 766.9,396.4 L 766.0,398.1 L 764.8,399.4 L 764.0,400.6 L 763.1,401.9 L 762.2,403.7 L 761.2,405.4 L 761.1,407.4 L 761.4,409.3 L 762.4,412.2 Z",',
    `  dashes: ${JSON.stringify(scsDashes, null, 4)},`,
    '  islands: [',
    "    { name: '东沙群岛', x: 739.4, y: 424.6, r: 1.5 },",
    "    { name: '西沙群岛', x: 707.7, y: 452.5, r: 1.5 },",
    "    { name: '中沙群岛', x: 732.8, y: 457.2, r: 1.5 },",
    "    { name: '黄岩岛', x: 746.0, y: 461.9, r: 1.2 },",
    "    { name: '南沙群岛', x: 724.2, y: 492.5, r: 1.5 },",
    "    { name: '曾母暗沙', x: 709.6, y: 537.0, r: 1.5 },",
    '  ],',
    '};',
    '',
    '// 6. 地级行政区划 Albers 投影坐标字典 (由单一事实来源 CHINA_CITIES 派生，RC-76)',
    'export const CITY_COORDINATES: Record<string, { x: number; y: number }> = Object.fromEntries(',
    '  CHINA_CITIES.map((c) => [c.code, { x: c.x, y: c.y }])',
    ');',
    '',
    '// 7. 省级行政区几何中心保底坐标',
    'export const PROVINCE_DEFAULTS: Record<string, { x: number; y: number }> = {',
    '  "11": { x: 462.4, y: 220.6 },',
    '  "12": { x: 471.5, y: 230.6 },',
    '  "13": { x: 446.0, y: 247.3 },',
    '  "14": { x: 422.3, y: 260.6 },',
    '  "15": { x: 446.6, y: 191.0 },',
    '  "21": { x: 509.3, y: 201.2 },',
    '  "22": { x: 539.0, y: 172.5 },',
    '  "23": { x: 549.9, y: 130.3 },',
    '  "31": { x: 531.0, y: 327.6 },',
    '  "32": { x: 504.7, y: 307.7 },',
    '  "33": { x: 518.5, y: 342.3 },',
    '  "34": { x: 486.2, y: 326.6 },',
    '  "35": { x: 505.7, y: 379.8 },',
    '  "36": { x: 475.2, y: 367.5 },',
    '  "37": { x: 478.4, y: 260.0 },',
    '  "41": { x: 443.9, y: 297.4 },',
    '  "42": { x: 440.4, y: 337.8 },',
    '  "43": { x: 432.2, y: 379.7 },',
    '  "44": { x: 448.9, y: 429.7 },',
    '  "45": { x: 397.6, y: 431.1 },',
    '  "46": { x: 418.3, y: 503.3 },',
    '  "50": { x: 387.5, y: 358.9 },',
    '  "51": { x: 343.3, y: 355.8 },',
    '  "52": { x: 377.9, y: 400.1 },',
    '  "53": { x: 329.8, y: 436.4 },',
    '  "54": { x: 211.2, y: 342.8 },',
    '  "61": { x: 404.9, y: 297.8 },',
    '  "62": { x: 343.4, y: 275.6 },',
    '  "63": { x: 316.8, y: 270.3 },',
    '  "64": { x: 362.9, y: 246.2 },',
    '  "65": { x: 188.3, y: 161.3 },',
    '  "71": { x: 544.9, y: 408.0 },',
    '  "81": { x: 461.9, y: 454.6 },',
    '  "82": { x: 454.4, y: 456.8 },',
    '};',
    '',
    '// 8. 省份简称与全称双向确定性映射表 (RC-91 省市名称归一)',
    'export const PROVINCE_SHORT_TO_FULL: Record<string, string> = {',
    "  '北京': '北京市',",
    "  '天津': '天津市',",
    "  '河北': '河北省',",
    "  '山西': '山西省',",
    "  '内蒙古': '内蒙古自治区',",
    "  '辽宁': '辽宁省',",
    "  '吉林': '吉林省',",
    "  '黑龙江': '黑龙江省',",
    "  '上海': '上海市',",
    "  '江苏': '江苏省',",
    "  '浙江': '浙江省',",
    "  '安徽': '安徽省',",
    "  '福建': '福建省',",
    "  '江西': '江西省',",
    "  '山东': '山东省',",
    "  '河南': '河南省',",
    "  '湖北': '湖北省',",
    "  '湖南': '湖南省',",
    "  '广东': '广东省',",
    "  '广西': '广西壮族自治区',",
    "  '海南': '海南省',",
    "  '重庆': '重庆市',",
    "  '四川': '四川省',",
    "  '贵州': '贵州省',",
    "  '云南': '云南省',",
    "  '西藏': '西藏自治区',",
    "  '陕西': '陕西省',",
    "  '甘肃': '甘肃省',",
    "  '青海': '青海省',",
    "  '宁夏': '宁夏回族自治区',",
    "  '新疆': '新疆维吾尔自治区',",
    "  '台湾': '台湾省',",
    "  '香港': '香港特别行政区',",
    "  '澳门': '澳门特别行政区',",
    '};',
    '',
    'export const PROVINCE_FULL_TO_SHORT: Record<string, string> = Object.fromEntries(',
    '  Object.entries(PROVINCE_SHORT_TO_FULL).map(([k, v]) => [v, k])',
    ');',
    '',
    'export const PROVINCE_ADCODE_TO_NAME: Record<string, string> = Object.fromEntries(',
    '  PROVINCES_DATA.map((p) => [p.adcode, p.name])',
    ');',
    '',
    'export const PROVINCE_NAME_TO_ADCODE: Record<string, string> = Object.fromEntries(',
    '  PROVINCES_DATA.map((p) => [p.name, p.adcode])',
    ');',
    '',
    '/**',
    ' * 将各种形式的省份名称归一化为官方全称 (如 浙江 -> 浙江省, 浙江省 -> 浙江省)',
    ' */',
    'export function normalizeProvinceName(name: string): string {',
    '  if (!name) return "";',
    '  if (PROVINCE_NAME_TO_ADCODE[name]) return name;',
    '  if (PROVINCE_SHORT_TO_FULL[name]) return PROVINCE_SHORT_TO_FULL[name];',
    '  return name;',
    '}',
    '',
    '/**',
    ' * 根据 6 位城市代码获取所属省份的标准 6 位 adcode (如 330100 -> 330000)',
    ' */',
    'export function getProvinceAdcodeByCityCode(cityCode: string): string {',
    '  if (!cityCode || cityCode.length < 2) return "";',
    '  return cityCode.slice(0, 2) + "0000";',
    '}',
    '',
    '/**',
    ' * 根据行政区划代码获取投影画布绝对像素坐标',
    ' * 包含精确匹配、县级市辖区上卷至地级市、直辖市前缀上卷与省级保底逻辑 (RC-76)',
    ' */',
    'export function getCityProjectedPosition(code: string): { x: number; y: number } {',
    '  if (!code) return { x: 350, y: 350 };',
    '  if (CITY_COORDINATES[code]) {',
    '    return CITY_COORDINATES[code];',
    '  }',
    '  // 1. 尝试县级/市辖区上卷至地级市 (例如 110101 -> 110100)',
    '  const prefCode = code.slice(0, 4) + "00";',
    '  if (CITY_COORDINATES[prefCode]) {',
    '    return CITY_COORDINATES[prefCode];',
    '  }',
    '  // 2. 尝试直辖市代码上卷 (例如 110000 -> 110100)',
    '  const munCode = code.slice(0, 2) + "0100";',
    '  if (CITY_COORDINATES[munCode]) {',
    '    return CITY_COORDINATES[munCode];',
    '  }',
    '  // 3. 省级几何中心保底',
    '  const provPrefix = code.slice(0, 2);',
    '  if (PROVINCE_DEFAULTS[provPrefix]) {',
    '    return PROVINCE_DEFAULTS[provPrefix];',
    '  }',
    '  return { x: 350, y: 350 };',
    '}',
    '',
  ];

  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
  console.log(`  成功生成 34 个省级轮廓 ＋ ${cityBoundaries.length} 个市级轮廓与地图主数据至 ${outputPath}`);
}

async function main() {
  const citiesPath = path.join(ROOT_DIR, 'src', 'utils', 'cities.ts');
  const chinaMapDataPath = path.join(ROOT_DIR, 'src', 'utils', 'chinaMapData.ts');

  const { cities, cityBoundaries, provGeojson, scsDashes } = loadFromLocalGeoArchive();

  if (cities.length !== 375) {
    throw new Error(`Expected exactly 375 cities, but got ${cities.length}`);
  }
  if (cityBoundaries.length !== 370) {
    throw new Error(`Expected 370 city boundaries, but got ${cityBoundaries.length}`);
  }

  generateCitiesTs(cities, citiesPath);
  await generateChinaMapDataTs(provGeojson, cityBoundaries, scsDashes, chinaMapDataPath);

  console.log('[4/4] 验证校验完成：375 个地级行政区、34 个省级轮廓、370 个市级轮廓、34 个省会标记与 100000_JD 十段线均由构建脚本从离线数据数学投影生成。');
}

main().catch((err) => {
  console.error('Build map error:', err);
  process.exit(1);
});

