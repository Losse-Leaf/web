// 中国合规地级行政区划与直辖市/港澳台代码表 (标准 6 位行政区划代码)
export interface CityOption {
  code: string
  name: string
  province: string
  pinyin: string
}

export const CHINA_CITIES: CityOption[] = [
  // 直辖市
  { code: '110100', name: '北京市', province: '北京', pinyin: 'beijing' },
  { code: '120100', name: '天津市', province: '天津', pinyin: 'tianjin' },
  { code: '310100', name: '上海市', province: '上海', pinyin: 'shanghai' },
  { code: '500100', name: '重庆市', province: '重庆', pinyin: 'chongqing' },

  // 特别行政区与台湾省
  { code: '810000', name: '香港特别行政区', province: '香港', pinyin: 'xianggang hong kong' },
  { code: '820000', name: '澳门特别行政区', province: '澳门', pinyin: 'aomen macau' },
  { code: '710000', name: '台北市', province: '台湾', pinyin: 'taibei' },
  { code: '710100', name: '高雄市', province: '台湾', pinyin: 'gaoxiong' },
  { code: '710200', name: '台中市', province: '台湾', pinyin: 'taizhong' },
  { code: '710300', name: '台南市', province: '台湾', pinyin: 'tainan' },

  // 浙江省
  { code: '330100', name: '杭州市', province: '浙江', pinyin: 'hangzhou' },
  { code: '330200', name: '宁波市', province: '浙江', pinyin: 'ningbo' },
  { code: '330300', name: '温州市', province: '浙江', pinyin: 'wenzhou' },
  { code: '330400', name: '嘉兴市', province: '浙江', pinyin: 'jiaxing' },
  { code: '330500', name: '湖州市', province: '浙江', pinyin: 'huzhou' },
  { code: '330600', name: '绍兴市', province: '浙江', pinyin: 'shaoxing' },
  { code: '330700', name: '金华市', province: '浙江', pinyin: 'jinhua' },
  { code: '330800', name: '衢州市', province: '浙江', pinyin: 'quzhou' },
  { code: '330900', name: '舟山市', province: '浙江', pinyin: 'zhoushan' },
  { code: '331000', name: '台州市', province: '浙江', pinyin: 'taizhou' },
  { code: '331100', name: '丽水市', province: '浙江', pinyin: 'lishui' },

  // 江苏省
  { code: '320100', name: '南京市', province: '江苏', pinyin: 'nanjing' },
  { code: '320200', name: '无锡市', province: '江苏', pinyin: 'wuxi' },
  { code: '320300', name: '徐州市', province: '江苏', pinyin: 'xuzhou' },
  { code: '320400', name: '常州市', province: '江苏', pinyin: 'changzhou' },
  { code: '320500', name: '苏州市', province: '江苏', pinyin: 'suzhou' },
  { code: '320600', name: '南通市', province: '江苏', pinyin: 'nantong' },
  { code: '320700', name: '连云港市', province: '江苏', pinyin: 'lianyungang' },
  { code: '320800', name: '淮安市', province: '江苏', pinyin: 'huaian' },
  { code: '320900', name: '盐城市', province: '江苏', pinyin: 'yancheng' },
  { code: '321000', name: '扬州市', province: '江苏', pinyin: 'yangzhou' },
  { code: '321100', name: '镇江市', province: '江苏', pinyin: 'zhenjiang' },
  { code: '321200', name: '泰州市', province: '江苏', pinyin: 'taizhou' },
  { code: '321300', name: '宿迁市', province: '江苏', pinyin: 'suqian' },

  // 广东省
  { code: '440100', name: '广州市', province: '广东', pinyin: 'guangzhou' },
  { code: '440300', name: '深圳市', province: '广东', pinyin: 'shenzhen' },
  { code: '440400', name: '珠海市', province: '广东', pinyin: 'zhuhai' },
  { code: '440600', name: '佛山市', province: '广东', pinyin: 'foshan' },
  { code: '441900', name: '东莞市', province: '广东', pinyin: 'dongguan' },
  { code: '442000', name: '中山市', province: '广东', pinyin: 'zhongshan' },
  { code: '441300', name: '惠州市', province: '广东', pinyin: 'huizhou' },
  { code: '440700', name: '江门市', province: '广东', pinyin: 'jiangmen' },
  { code: '440500', name: '汕头市', province: '广东', pinyin: 'shantou' },
  { code: '445200', name: '揭阳市', province: '广东', pinyin: 'jieyang' },
  { code: '445100', name: '潮州市', province: '广东', pinyin: 'chaozhou' },
  { code: '440800', name: '湛江市', province: '广东', pinyin: 'zhanjiang' },
  { code: '440900', name: '茂名市', province: '广东', pinyin: 'maoming' },
  { code: '440200', name: '韶关市', province: '广东', pinyin: 'shaoguan' },
  { code: '441200', name: '肇庆市', province: '广东', pinyin: 'zhaoqing' },
  { code: '441800', name: '清远市', province: '广东', pinyin: 'qingyuan' },
  { code: '441400', name: '梅州市', province: '广东', pinyin: 'meizhou' },

  // 四川省
  { code: '510100', name: '成都市', province: '四川', pinyin: 'chengdu' },
  { code: '510700', name: '绵阳市', province: '四川', pinyin: 'mianyang' },
  { code: '511100', name: '乐山市', province: '四川', pinyin: 'leshan' },
  { code: '511300', name: '南充市', province: '四川', pinyin: 'nanchong' },
  { code: '511500', name: '宜宾市', province: '四川', pinyin: 'yibin' },
  { code: '510500', name: '泸州市', province: '四川', pinyin: 'luzhou' },
  { code: '513200', name: '阿坝藏族羌族自治州', province: '四川', pinyin: 'aba jiuzhaigou' },
  { code: '513300', name: '甘孜藏族自治州', province: '四川', pinyin: 'ganzi daocheng' },
  { code: '513400', name: '凉山彝族自治州', province: '四川', pinyin: 'liangshan xichang' },

  // 云南省
  { code: '530100', name: '昆明市', province: '云南', pinyin: 'kunming' },
  { code: '532900', name: '大理白族自治州', province: '云南', pinyin: 'dali' },
  { code: '530700', name: '丽江市', province: '云南', pinyin: 'lijiang' },
  { code: '533400', name: '迪庆藏族自治州', province: '云南', pinyin: 'diqing shangrila' },
  { code: '532800', name: '西双版纳傣族自治州', province: '云南', pinyin: 'xishuangbanna' },
  { code: '530500', name: '保山市', province: '云南', pinyin: 'baoshan tengchong' },

  // 福建省
  { code: '350100', name: '福州市', province: '福建', pinyin: 'fuzhou' },
  { code: '350200', name: '厦门市', province: '福建', pinyin: 'xiamen' },
  { code: '350500', name: '泉州市', province: '福建', pinyin: 'quanzhou' },
  { code: '350600', name: '漳州市', province: '福建', pinyin: 'zhangzhou' },
  { code: '350700', name: '南平市', province: '福建', pinyin: 'nanping wuyishan' },

  // 江西省
  { code: '360100', name: '南昌市', province: '江西', pinyin: 'nanchang' },
  { code: '360200', name: '景德镇市', province: '江西', pinyin: 'jingdezhen' },
  { code: '360400', name: '九江市', province: '江西', pinyin: 'jiujiang lushan' },
  { code: '361100', name: '上饶市', province: '江西', pinyin: 'shangrao wuyuan' },
  { code: '360700', name: '赣州市', province: '江西', pinyin: 'ganzhou' },

  // 湖南省
  { code: '430100', name: '长沙市', province: '湖南', pinyin: 'changsha' },
  { code: '430800', name: '张家界市', province: '湖南', pinyin: 'zhangjiajie' },
  { code: '433100', name: '湘西土家族苗族自治州', province: '湖南', pinyin: 'xiangxi fenghuang' },
  { code: '430600', name: '岳阳市', province: '湖南', pinyin: 'yueyang' },

  // 湖北省
  { code: '420100', name: '武汉市', province: '湖北', pinyin: 'wuhan' },
  { code: '420500', name: '宜昌市', province: '湖北', pinyin: 'yichang' },
  { code: '422800', name: '恩施土家族苗族自治州', province: '湖北', pinyin: 'enshi' },

  // 陕西省
  { code: '610100', name: '西安市', province: '陕西', pinyin: 'xian' },
  { code: '610600', name: '延安市', province: '陕西', pinyin: 'yanan' },
  { code: '610300', name: '宝鸡市', province: '陕西', pinyin: 'baoji' },
  { code: '610500', name: '渭南市', province: '陕西', pinyin: 'weinan huashan' },

  // 山东省
  { code: '370100', name: '济南市', province: '山东', pinyin: 'jinan' },
  { code: '370200', name: '青岛市', province: '山东', pinyin: 'qingdao' },
  { code: '370600', name: '烟台市', province: '山东', pinyin: 'yantai' },
  { code: '371000', name: '威海市', province: '山东', pinyin: 'weihai' },
  { code: '370900', name: '泰安市', province: '山东', pinyin: 'taian taishan' },

  // 河南省
  { code: '410100', name: '郑州市', province: '河南', pinyin: 'zhengzhou' },
  { code: '410300', name: '洛阳市', province: '河南', pinyin: 'luoyang' },
  { code: '410200', name: '开封市', province: '河南', pinyin: 'kaifeng' },

  // 安徽省
  { code: '340100', name: '合肥市', province: '安徽', pinyin: 'hefei' },
  { code: '341000', name: '黄山市', province: '安徽', pinyin: 'huangshan' },
  { code: '340200', name: '芜湖市', province: '安徽', pinyin: 'wuhu' },

  // 贵州省
  { code: '520100', name: '贵阳市', province: '贵州', pinyin: 'guiyang' },
  { code: '520300', name: '遵义市', province: '贵州', pinyin: 'zunyi' },
  { code: '522600', name: '黔东南苗族侗族自治州', province: '贵州', pinyin: 'qiandongnan' },

  // 广西壮族自治区
  { code: '450100', name: '南宁市', province: '广西', pinyin: 'nanning' },
  { code: '450300', name: '桂林市', province: '广西', pinyin: 'guilin' },
  { code: '450500', name: '北海市', province: '广西', pinyin: 'beihai weizhou' },
  { code: '450200', name: '柳州市', province: '广西', pinyin: 'liuzhou' },

  // 海南省
  { code: '460100', name: '海口市', province: '海南', pinyin: 'haikou' },
  { code: '460200', name: '三亚市', province: '海南', pinyin: 'sanya' },
  { code: '460300', name: '三沙市', province: '海南', pinyin: 'sansha' },
  { code: '469000', name: '万宁市', province: '海南', pinyin: 'wanning' },

  // 西藏自治区
  { code: '540100', name: '拉萨市', province: '西藏', pinyin: 'lasa lhasa' },
  { code: '540400', name: '林芝市', province: '西藏', pinyin: 'linzhi' },
  { code: '540200', name: '日喀则市', province: '西藏', pinyin: 'rikaze' },

  // 新疆维吾尔自治区
  { code: '650100', name: '乌鲁木齐市', province: '新疆', pinyin: 'wulumuqi urumqi' },
  { code: '654000', name: '伊犁哈萨克自治州', province: '新疆', pinyin: 'yili' },
  { code: '654300', name: '阿勒泰地区', province: '新疆', pinyin: 'aletai kanasi' },
  { code: '653100', name: '喀什地区', province: '新疆', pinyin: 'kashi kashgar' },

  // 青海省
  { code: '630100', name: '西宁市', province: '青海', pinyin: 'xining' },
  { code: '632800', name: '海西蒙古族藏族自治州', province: '青海', pinyin: 'haixi chaka' },

  // 甘肃省
  { code: '620100', name: '兰州市', province: '甘肃', pinyin: 'lanzhou' },
  { code: '620900', name: '酒泉市', province: '甘肃', pinyin: 'jiuquan dunhuang' },
  { code: '620700', name: '张掖市', province: '甘肃', pinyin: 'zhangye' },

  // 宁夏回族自治区
  { code: '640100', name: '银川市', province: '宁夏', pinyin: 'yinchuan' },
  { code: '640500', name: '中卫市', province: '宁夏', pinyin: 'zhongwei' },

  // 内蒙古自治区
  { code: '150100', name: '呼和浩特市', province: '内蒙古', pinyin: 'huhehaote' },
  { code: '150700', name: '呼伦贝尔市', province: '内蒙古', pinyin: 'hulunbeier' },

  // 黑龙江省
  { code: '230100', name: '哈尔滨市', province: '黑龙江', pinyin: 'haerbin' },
  { code: '232700', name: '大兴安岭地区', province: '黑龙江', pinyin: 'mohe' },

  // 吉林省
  { code: '220100', name: '长春市', province: '吉林', pinyin: 'changchun' },
  { code: '222400', name: '延边朝鲜族自治州', province: '吉林', pinyin: 'yanbian yanji' },

  // 辽宁省
  { code: '210100', name: '沈阳市', province: '辽宁', pinyin: 'shenyang' },
  { code: '210200', name: '大连市', province: '辽宁', pinyin: 'dalian' },

  // 河北省
  { code: '130100', name: '石家庄市', province: '河北', pinyin: 'shijiazhuang' },
  { code: '130300', name: '秦皇岛市', province: '河北', pinyin: 'qinhuangdao' },
  { code: '130700', name: '张家口市', province: '河北', pinyin: 'zhangjiakou' },

  // 山西省
  { code: '140100', name: '太原市', province: '山西', pinyin: 'taiyuan' },
  { code: '140200', name: '大同市', province: '山西', pinyin: 'datong' },
  { code: '140700', name: '晋中市', province: '山西', pinyin: 'jinzhong pingyao' },
]

export function searchCities(keyword: string): CityOption[] {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return CHINA_CITIES.slice(0, 30)
  return CHINA_CITIES.filter((c) => {
    return (
      c.name.includes(kw) ||
      c.province.includes(kw) ||
      c.pinyin.includes(kw) ||
      c.code.startsWith(kw)
    )
  }).slice(0, 40)
}
