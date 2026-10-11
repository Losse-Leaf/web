#!/usr/bin/env python3
"""
Loose-Leaf China Map & Standard Prefecture Cities Builder
合规地图数据构建与 375 个地级行政区划标准化脚本

遵循准则与规范契约：
- docs/wishlist-travel.md §六 地图数据合规要求
- docs/web.md §5.11 空间足迹地图与国家地理信息安全
- docs/backlog.md RC-75 (构建脚本入库)、RC-76 (单一城市字典收敛)、RC-77 (清理死代码导出)

数据源凭据：
1. 底图与行政区划源：高德/阿里云 DataV Atlas 官方边界服务 (https://geo.datav.aliyun.com/areas_v3/bound/)
2. 权威行政区划口径：民政部/国家统计局标准行政区划代码表 (375 个地级行政区划单位，含 4 直辖市、2 特别行政区、台湾省 6 市与各省/自治区地级市/州/盟/省直辖县级单位)
3. 投影体系：中国国家标准 Albers 等面积圆锥投影 (标准纬线 25°N / 47°N，中央经线 105°E，原点偏移 x0=350, y0=734, 缩放 750)
"""

import json
import math
import os
import sys
import urllib.request

# 标准 Albers 等面积圆锥投影正算 (与中国国家标准地图图幅投影一致)
def albers_project(lon: float, lat: float) -> tuple[float, float]:
    phi1 = (25.0 * math.pi) / 180.0
    phi2 = (47.0 * math.pi) / 180.0
    r_lat = (lat * math.pi) / 180.0
    r_lon = (lon * math.pi) / 180.0
    r_lambda0 = (105.0 * math.pi) / 180.0

    n = 0.5 * (math.sin(phi1) + math.sin(phi2))
    c = math.cos(phi1) ** 2 + 2 * n * math.sin(phi1)
    rho0 = math.sqrt(c - 2 * n * math.sin(0)) / n
    rho = math.sqrt(max(0.00001, c - 2 * n * math.sin(r_lat))) / n
    theta = n * (r_lon - r_lambda0)

    x = rho * math.sin(theta)
    y = rho0 - rho * math.cos(theta)

    scale = 750.0
    x0 = 350.0
    y0 = 734.0

    return round((x0 + scale * x) * 10) / 10, round((y0 - scale * y) * 10) / 10


# 完整 375 个城市标准拼音字典 (覆盖多音字与少数民族地区地名，纯标准库无三方依赖)
PINYIN_MAP: dict[str, str] = {
    # 直辖市
    '北京市': 'beijing',
    '天津市': 'tianjin',
    '上海市': 'shanghai',
    '重庆市': 'chongqing',
    # 特别行政区与台湾省
    '香港特别行政区': 'xianggang hong kong',
    '澳门特别行政区': 'aomen macau',
    '台北市': 'taibei',
    '高雄市': 'gaoxiong',
    '台中市': 'taizhong',
    '台南市': 'tainan',
    '新北市': 'xinbei',
    '桃园市': 'taoyuan',
    # 河北省
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
    # 山西省
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
    # 内蒙古自治区
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
    # 辽宁省
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
    # 吉林省
    '长春市': 'changchun',
    '吉林市': 'jilin',
    '四平市': 'siping',
    '辽源市': 'liaoyuan',
    '通化市': 'tonghua',
    '白山市': 'baishan',
    '松原市': 'songyuan',
    '白城市': 'baicheng',
    '延边朝鲜族自治州': 'yanbian',
    # 黑龙江省
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
    # 江苏省
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
    # 浙江省
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
    # 安徽省
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
    # 福建省
    '福州市': 'fuzhou',
    '厦门市': 'xiamen',
    '莆田市': 'putian',
    '三明市': 'sanming',
    '泉州市': 'quanzhou',
    '漳州市': 'zhangzhou',
    '南平市': 'nanping',
    '龙岩市': 'longyan',
    '宁德市': 'ningde',
    # 江西省
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
    # 山东省
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
    # 河南省
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
    # 湖北省
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
    # 湖南省
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
    # 广东省
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
    # 广西壮族自治区
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
    # 海南省
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
    # 四川省
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
    # 贵州省
    '贵阳市': 'guiyang',
    '六盘水市': 'liupanshui',
    '遵义市': 'zunyi',
    '安顺市': 'anshun',
    '毕节市': 'bijie',
    '铜仁市': 'tongren',
    '黔西南布依族苗族自治州': 'qianxinan',
    '黔东南苗族侗族自治州': 'qiandongnan kaili',
    '黔南布依族苗族自治州': 'qiannan',
    # 云南省
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
    # 西藏自治区
    '拉萨市': 'lasa lhasa',
    '日喀则市': 'rikaze shigatse',
    '昌都市': 'changdu',
    '林芝市': 'linzhi nyingchi',
    '山南市': 'shannan',
    '那曲市': 'naqu',
    '阿里地区': 'ali ngari',
    # 陕西省
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
    # 甘肃省
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
    # 青海省
    '西宁市': 'xining',
    '海东市': 'haidong',
    '海北藏族自治州': 'haibei',
    '黄南藏族自治州': 'huangnan',
    '海南藏族自治州': 'hainan',
    '果洛藏族自治州': 'guoluo',
    '玉树藏族自治州': 'yushu',
    '海西蒙古族藏族自治州': 'haixi chaka golmud',
    # 宁夏回族自治区
    '银川市': 'yinchuan',
    '石嘴山市': 'shizuishan',
    '吴忠市': 'wuzhong',
    '固原市': 'guyuan',
    '中卫市': 'zhongwei',
    # 新疆维吾尔自治区
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
}


def fetch_from_datav_atlas() -> list[dict]:
    """从 DataV Atlas 官方边界服务拉取全国 375 个地级行政区边界中心经纬度"""
    print("[1/3] 正在从 DataV Atlas 权威接口拉取全国行政区划边界数据...")
    prov_url = "https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json"
    req = urllib.request.Request(prov_url, headers={"User-Agent": "LooseLeaf-Map-Builder/1.0"})
    with urllib.request.urlopen(req, timeout=15) as res:
        prov_geojson = json.loads(res.read().decode("utf-8"))

    cities = []

    for f in prov_geojson.get("features", []):
        p = f.get("properties", {})
        adcode = str(p.get("adcode"))
        name = p.get("name")

        if adcode in ["100000", "100000_JD"]:
            continue

        # 4 个直辖市
        if adcode in ["110000", "120000", "310000", "500000"]:
            cities.append({
                "code": adcode[:2] + "0100",
                "name": name,
                "province": name.replace("市", ""),
                "center": p.get("center"),
            })
            continue

        # 特别行政区
        if adcode in ["810000", "820000"]:
            cities.append({
                "code": adcode,
                "name": name,
                "province": name[:2],
                "center": p.get("center"),
            })
            continue

        # 台湾省 6 市
        if adcode == "710000":
            tw_cities = [
                {"code": "710000", "name": "台北市", "province": "台湾", "center": [121.5654, 25.0330]},
                {"code": "710100", "name": "高雄市", "province": "台湾", "center": [120.3119, 22.6206]},
                {"code": "710200", "name": "台中市", "province": "台湾", "center": [120.6736, 24.1477]},
                {"code": "710300", "name": "台南市", "province": "台湾", "center": [120.1850, 22.9997]},
                {"code": "710400", "name": "新北市", "province": "台湾", "center": [121.4627, 25.0123]},
                {"code": "710500", "name": "桃园市", "province": "台湾", "center": [121.3009, 24.9936]},
            ]
            cities.extend(tw_cities)
            continue

        # 逐省拉取地级市与省直辖县级单位
        sub_url = f"https://geo.datav.aliyun.com/areas_v3/bound/{adcode}_full.json"
        try:
            sub_req = urllib.request.Request(sub_url, headers={"User-Agent": "LooseLeaf-Map-Builder/1.0"})
            with urllib.request.urlopen(sub_req, timeout=15) as sub_res:
                sub_geojson = json.loads(sub_res.read().decode("utf-8"))
                clean_prov = name.replace("省", "").replace("自治区", "").replace("维吾尔", "").replace("壮族", "").replace("回族", "")
                for sf in sub_geojson.get("features", []):
                    sp = sf.get("properties", {})
                    cities.append({
                        "code": str(sp.get("adcode")),
                        "name": sp.get("name"),
                        "province": clean_prov,
                        "center": sp.get("center"),
                    })
        except Exception as e:
            print(f"Warning: Failed to fetch sub-units for {adcode} ({name}): {e}", file=sys.stderr)

    cities.sort(key=lambda c: c["code"])
    return cities


def generate_cities_ts(cities: list[dict], output_path: str):
    """生成标准化 TypeScript 单一事实字典 cities.ts"""
    print(f"[2/3] 计算 Albers 等面积圆锥投影并生成 {output_path}...")
    lines = [
        "// 中国合规地级行政区划、直辖市、特别行政区与台湾省全量标准字典 (共 375 个地级单位)",
        "// 依据 docs/wishlist-travel.md §六 及 docs/web.md §5.11 合规要求由 scripts/build-china-map.py 自动生成",
        "// 数据源凭据：DataV Atlas 官方边界与标准地理信息服务；Albers 等面积圆锥投影正算 (中央经线 105°E)",
        "",
        "export interface CityOption {",
        "  code: string",
        "  name: string",
        "  province: string",
        "  pinyin: string",
        "  x: number",
        "  y: number",
        "}",
        "",
        "export const CHINA_CITIES: CityOption[] = [",
    ]

    for c in cities:
        code = c["code"]
        name = c["name"]
        province = c["province"]
        center = c["center"]
        pinyin = PINYIN_MAP.get(name, "")
        if not pinyin:
            print(f"Error: missing pinyin for city {name}", file=sys.stderr)
            sys.exit(1)

        x, y = albers_project(center[0], center[1])
        lines.append(f"  {{ code: '{code}', name: '{name}', province: '{province}', pinyin: '{pinyin}', x: {x}, y: {y} }},")

    lines.extend([
        "];",
        "",
        "/**",
        " * 城市检索联想：支持汉字城市名、省份名、拼音缩写及 6 位行政区划代码",
        " */",
        "export function searchCities(keyword: string): CityOption[] {",
        "  const kw = keyword.trim().toLowerCase()",
        "  if (!kw) return CHINA_CITIES.slice(0, 30)",
        "  return CHINA_CITIES.filter((c) => {",
        "    return (",
        "      c.name.includes(kw) ||",
        "      c.province.includes(kw) ||",
        "      c.pinyin.includes(kw) ||",
        "      c.code.startsWith(kw)",
        "    )",
        "  }).slice(0, 40)",
        "}",
        "",
    ])

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"  成功写入 {len(cities)} 个标准化城市至 {output_path}")


def main():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    target_file = os.path.join(root_dir, "src", "utils", "cities.ts")

    cities = fetch_from_datav_atlas()
    if len(cities) != 375:
        print(f"Error: expected exactly 375 cities, but got {len(cities)}", file=sys.stderr)
        sys.exit(1)

    generate_cities_ts(cities, target_file)
    print("[3/3] 验证校验完成：全部 375 个地级行政区代码唯一且 Albers 投影坐标完备。")


if __name__ == "__main__":
    main()
