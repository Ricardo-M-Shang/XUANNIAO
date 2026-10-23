import type { Place, Realm } from "./data";

export type LandscapeStyle =
  | "village"
  | "mountain"
  | "city"
  | "island"
  | "snow"
  | "ruins"
  | "water"
  | "palace";
export interface LandscapeProfile {
  style: LandscapeStyle;
  title: string;
  features: string[];
  note: string;
}
const profiles: Record<string, LandscapeProfile> = {
  qingniu: {
    style: "village",
    title: "阡陌之间，灰瓦临水",
    features: ["田畴与水渠", "乡野院落", "枯桑与石径"],
    note: "田地、水渠与枯桑见原稿；房舍排列、桥梁与水车为乡野景观的视觉演绎。",
  },
  lingxu: {
    style: "mountain",
    title: "青苔古路，层台入云",
    features: ["青崖山门", "依山院落", "曲折石阶"],
    note: "青崖山、山门及三百七十二级古路见原稿；建筑形制与院落布局为示意。",
  },
  qingya: {
    style: "mountain",
    title: "石壁层叠，林溪相随",
    features: ["层叠山壁", "山麓林地", "溪谷石道"],
    note: "山地归属见原稿，局部岩壁、植被与溪流布局为示意。",
  },
  kunlun: {
    style: "mountain",
    title: "重檐高殿，群峰为屏",
    features: ["昆仑群峰", "重檐院落", "高台石阶"],
    note: "位于中洲昆仑山脉；宫观外形、台阶与殿宇数量均为景观演绎。",
  },
  penglai: {
    style: "island",
    title: "三岛浮翠，楼阁临海",
    features: ["三仙岛", "临海楼阁", "岛岸瀑流"],
    note: "东海三仙岛与蓬莱有原稿依据；楼阁、瀑流和码头不构成新增正史地点。",
  },
  "snow-pass": {
    style: "snow",
    title: "雪岭夹关，孤城当道",
    features: ["覆雪石墙", "关门城楼", "雪域松林"],
    note: "北洲雪关见第六卷；关城形制与城墙走向为示意。",
  },
  duanjian: {
    style: "mountain",
    title: "孤峰断壁，石桥凌空",
    features: ["断剑峰", "峰顶院落", "峡间石桥"],
    note: "断剑峰与紫霄的归属见原稿；石桥与峰顶建筑为视觉演绎。",
  },
  tianji: {
    style: "mountain",
    title: "孤峰悬立，小观临崖",
    features: ["悬空孤峰", "观台重檐", "岩下云雾"],
    note: "原稿明确孤峰位于中洲与北洲交界；局部建筑仅为示意。",
  },
  wanzang: {
    style: "ruins",
    title: "石岭纵横，古道入谷",
    features: ["陡峭岩岭", "谷口石门", "稀疏林地"],
    note: "万葬岭与赤霞谷的地理关系见原稿，谷口建筑为示意。",
  },
  shang: {
    style: "ruins",
    title: "断柱残垣，草木入阶",
    features: ["古代台基", "断柱残垣", "遗址石道"],
    note: "仅表现故商族旧地的遗址性质，不还原未经记载的祖地建筑布局。",
  },
  kuchan: {
    style: "palace",
    title: "古寺闭门，白塔静立",
    features: ["寺院重檐", "白骨塔", "深林石阶"],
    note: "寺院位于故商族旧地边缘，白骨塔见原稿；外形与层数为示意。",
  },
  "su-valley": {
    style: "village",
    title: "林深谷隐，白墙临溪",
    features: ["隐秘山谷", "谷中院落", "林间溪水"],
    note: "原稿只明确东洲南部隐秘山谷，院落与景观均采用示意表达。",
  },
  wujin: {
    style: "water",
    title: "重岩围水，渊色深沉",
    features: ["渊海水面", "环岸石壁", "深水纹理"],
    note: "无尽渊海位于西洲，魔渊在其下；水面形状与深度没有实测含义。",
  },
  moyuan: {
    style: "ruins",
    title: "渊穴暗藏，石脊环列",
    features: ["地下投影", "岩穴入口", "深渊岩脊"],
    note: "这是地下渊域的示意投影，地表岩穴造型不代表一座已知海面城池。",
  },
  "sea-eye": {
    style: "water",
    title: "回流成环，海纹入涡",
    features: ["海眼投影", "旋转水纹", "潮汐同心线"],
    note: "海眼见第六卷；旋流动画、尺度与海面位置为制图表达。",
  },
  tianque: {
    style: "palace",
    title: "五城十二楼，重台接云",
    features: ["五座城台", "轴线庭院", "环列天楼"],
    note: "五城十二楼结构有原稿依据；城楼样式、宫殿数量与轴线布局为示意。",
  },
  twelve: {
    style: "palace",
    title: "十二天楼，重檐环立",
    features: ["环列楼阁", "层叠飞檐", "高台廊道"],
    note: "原稿未逐一命名，图中的环列次序和楼体样式均属示意。",
  },
  qizheng: {
    style: "palace",
    title: "院墙深静，层阁相接",
    features: ["院落图式", "青瓦楼阁", "石砌平台"],
    note: "七政院所在地未在原稿中精确定位，院落是地标示意而非正式平面图。",
  },
  yuedu: {
    style: "city",
    title: "边城环水，长街向月",
    features: ["边城城墙", "巷陌院落", "临水街区"],
    note: "月渡的边城性质见原稿；城墙、岸线及街道布局为视觉演绎。",
  },
  zhaochuan: {
    style: "city",
    title: "三层城域，十三坊临川",
    features: ["上城高台", "中城街巷", "川下十三坊"],
    note: "城市三层结构与十三坊见第九卷；每坊建筑与具体平面格局为示意。",
  },
  abandoned: {
    style: "ruins",
    title: "断垣悬空，残阶入雾",
    features: ["破损台地", "残缺石柱", "地表裂隙"],
    note: "废弃天域与下方引律井见第七卷；裂隙、断垣和岩体形状为示意。",
  },
  jiutian: {
    style: "ruins",
    title: "失落天域，古门余影",
    features: ["古代遗址", "断裂石门", "散落石台"],
    note: "原稿确认为失落天域，建筑残迹的外观不对应额外的历史设定。",
  },
  well: {
    style: "ruins",
    title: "古井环砌，石阶向下",
    features: ["古井投影", "环形石台", "下沉井口"],
    note: "引律井位于废弃天域下方；用地表投影显示，不表示另一座城。",
  },
};

export function landscapeFor(place: Place): LandscapeProfile {
  if (profiles[place.id]) return profiles[place.id];
  if (place.realm === "spirit") {
    const variants: [LandscapeStyle, string, string[]][] = [
      ["island", "浮岛飞瀑，林泉相生", ["悬浮岩岛", "岛岸瀑流", "高低林冠"]],
      ["snow", "雪覆洞天，寒林静立", ["雪色山石", "针叶林地", "云下岩基"]],
      ["ruins", "石环残垣，苔痕入阶", ["旧址石环", "荒废台地", "稀疏古木"]],
      ["village", "山间院落，翠林环水", ["院落图式", "小型水塘", "繁茂林地"]],
    ];
    const [style, title, features] =
      variants[(Number(place.id.replace("cave-", "")) - 1) % variants.length];
    return {
      style,
      title,
      features,
      note: "洞天名称、生态与相互方位未逐一记载；本岛的景观差异仅供视觉浏览，不添加正史设定。",
    };
  }
  if (place.kind === "water")
    return {
      style: "water",
      title: "海天相接，潮纹舒展",
      features: ["层次水色", "海面潮纹", "水域投影"],
      note: "原稿没有记载此处具体岛屿、港口与航道，海面景观不补写新的地名。",
    };
  return {
    style: "city",
    title:
      place.id === "dayan" ? "赤瓦临阶，城郭连阡陌" : "城郭相依，巷陌入平原",
    features: ["区域聚落图式", "城墙与庭院", "农田与街道"],
    note: "皇朝标记表示所在区域；图中聚落不是正式都城，城墙、街巷和建筑均属示意。",
  };
}

export const scenicPicks: Record<Realm, string[]> = {
  human: ["qingniu", "kunlun", "penglai", "snow-pass", "lingxu", "duanjian"],
  spirit: ["cave-1", "cave-2", "cave-3", "cave-4"],
  celestial: ["tianque", "zhaochuan", "yuedu", "jiutian"],
};
