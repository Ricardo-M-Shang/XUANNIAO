import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownLeft,
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  Compass,
  Cloud,
  Castle,
  Expand,
  Eye,
  Globe2,
  HelpCircle,
  Layers3,
  Map,
  MapPin,
  Maximize2,
  Menu,
  Minus,
  Mountain,
  Navigation,
  Plus,
  Search,
  Sun,
  Sunset,
  Moon,
  Pause,
  Play,
  Trees,
  Waves,
  X,
} from "lucide-react";
import { AtlasScene } from "./AtlasScene";
import type { Lighting } from "./environment";
import { landscapeFor, scenicPicks } from "./landscapes";
import { LandscapeArt } from "./LandscapeArt";
import { PlaceCard } from "./PlaceCard";
import { MiniMap } from "./MiniMap";
import type { Layers } from "./AtlasScene";
import { places, realms, regions } from "./data";
import type { Place, PlaceKind, Point, Realm } from "./data";
import "./styles.css";
import "./landscape.css";

const defaultLayers: Layers = {
  terrain: true,
  water: true,
  places: true,
  labels: true,
  connections: false,
  buildings: true,
  vegetation: true,
  atmosphere: true,
};
const icons: Record<PlaceKind, typeof Mountain> = {
  mountain: Mountain,
  settlement: MapPin,
  ruin: Map,
  water: Waves,
};
const initialLocation = () => {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const place = places.find((p) => p.id === params.get("place"));
  const realm = realms.some((r) => r.id === params.get("realm"))
    ? (params.get("realm") as Realm)
    : "human";
  return { realm: place?.realm ?? realm, place: place?.id ?? null };
};
const initial = initialLocation();

function BrandMark() {
  return (
    <svg
      className="brand-mark"
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7 30 20 8l5 14 9-6-8 17-9-8-8 10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="m17 25 3-17M25 22l1 11"
        stroke="currentColor"
        strokeWidth=".75"
      />
    </svg>
  );
}
function RegionArt({
  index = 0,
  water = false,
}: {
  index?: number;
  water?: boolean;
}) {
  return (
    <svg viewBox="0 0 60 52" fill="none" aria-hidden="true">
      <path
        d="M1 43c10-6 15 1 25-5s20-2 33-7"
        stroke="currentColor"
        opacity=".2"
      />
      <path
        d="M1 49c10-6 15 1 25-5s20-2 33-7"
        stroke="currentColor"
        opacity=".12"
      />
      {water ? (
        <>
          <path
            d="M5 23q8-8 16 0t16 0 16 0M8 30q8-8 16 0t16 0 14 0"
            stroke="currentColor"
          />
          <path d="m28 22 6-10 8 12" stroke="currentColor" opacity=".5" />
        </>
      ) : (
        <>
          <path
            d={`M4 39 20 ${14 + (index % 3) * 3} 29 29 37 ${5 + (index % 4) * 3} 58 39Z`}
            fill="currentColor"
            opacity=".12"
          />
          <path
            d={`M4 39 20 ${14 + (index % 3) * 3} 29 29 37 ${5 + (index % 4) * 3} 58 39`}
            stroke="currentColor"
            strokeWidth=".9"
          />
          <path
            d="m20 18-3 16 12-5M37 10l-3 24 13 3"
            stroke="currentColor"
            opacity=".5"
          />
          <circle cx="11" cy="12" r="3" stroke="currentColor" opacity=".6" />
        </>
      )}
    </svg>
  );
}

function App() {
  const [realm, setRealm] = useState<Realm>(initial.realm);
  const [selected, setSelected] = useState<string | null>(initial.place);
  const [region, setRegion] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<"land" | "sea" | "saved">("land");
  const [layers, setLayers] = useState<Layers>(defaultLayers);
  const [flat, setFlat] = useState(false);
  const [lighting, setLighting] = useState<Lighting>("day");
  const [motion, setMotion] = useState(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [inspecting, setInspecting] = useState(false);
  const [viewport, setViewport] = useState<Point[]>([]);
  const [scenicOffset, setScenicOffset] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [layerPanel, setLayerPanel] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [saved, setSaved] = useState<string[]>(() => {
    try {
      return JSON.parse(
        localStorage.getItem("xuanniao-bookmarks") || "[]",
      ).filter(
        (id: unknown) =>
          typeof id === "string" && places.some((p) => p.id === id),
      );
    } catch {
      return [];
    }
  });
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<AtlasScene | null>(null);
  const selectRef = useRef<(id: string) => void>(() => {});
  const regionRef = useRef<(id: string) => void>(() => {});
  const dialogRef = useRef<HTMLDivElement>(null);
  const currentRealm = realms.find((r) => r.id === realm)!;
  const selectedPlace = places.find((p) => p.id === selected);
  const selectedRegion = regions.find((r) => r.id === region);

  const selectPlace = useCallback(
    (id: string) => {
      const place = places.find((p) => p.id === id);
      if (!place) return;
      if (place.realm !== realm) {
        setRealm(place.realm);
        setRegion(null);
        setSection("land");
      }
      setLayers((current) => ({ ...current, places: true }));
      setSelected(id);
      setQuery("");
      setMobileOpen(false);
      setInspecting(false);
    },
    [realm],
  );
  selectRef.current = selectPlace;
  const chooseRegion = useCallback((id: string) => {
    const chosen = regions.find((r) => r.id === id);
    if (!chosen) return;
    setRegion(id);
    setSelected(null);
    setMobileOpen(false);
    setQuery("");
    setInspecting(false);
    scene.current?.focus(chosen.center, chosen.water ? 1.3 : 1.65);
  }, []);
  regionRef.current = chooseRegion;

  useEffect(() => {
    if (!host.current) return;
    try {
      const atlas = new AtlasScene(
        host.current,
        {
          select: (id) => selectRef.current(id),
          region: (id) => regionRef.current(id),
          zoom: setZoom,
          viewport: setViewport,
          ready: () => setReady(true),
        },
        realm,
      );
      scene.current = atlas;
      return () => {
        atlas.dispose();
        scene.current = null;
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : "浏览器无法初始化地图");
    }
  }, []);
  useEffect(() => {
    scene.current?.setRealm(realm);
    setFlat(false);
    scene.current?.setFlat(false);
  }, [realm]);
  useEffect(() => {
    scene.current?.setLayers(layers);
  }, [layers]);
  useEffect(() => {
    scene.current?.selectPlace(selected);
    if (inspecting && selected) scene.current?.inspectPlace(selected);
  }, [selected, realm, inspecting]);
  useEffect(() => {
    scene.current?.setLighting(lighting);
  }, [lighting, realm]);
  useEffect(() => {
    scene.current?.setMotion(motion);
  }, [motion]);
  useEffect(() => {
    scene.current?.setFlat(flat);
  }, [flat]);
  useEffect(() => {
    try {
      localStorage.setItem("xuanniao-bookmarks", JSON.stringify(saved));
    } catch {
      /* Browsing still works if storage is disabled. */
    }
  }, [saved]);
  useEffect(() => {
    const params = new URLSearchParams({ realm });
    if (selected) params.set("place", selected);
    window.history.replaceState(null, "", `#${params}`);
  }, [realm, selected]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return;
      if (event.key === "Escape") {
        setHelp(false);
        setLayerPanel(false);
        setMobileOpen(false);
        setSelected(null);
        setInspecting(false);
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        scene.current?.zoomBy(1.3);
      }
      if (event.key === "-") {
        event.preventDefault();
        scene.current?.zoomBy(1 / 1.3);
      }
      if (event.key === "0") {
        scene.current?.reset();
        setSelected(null);
        setRegion(null);
      }
      if (event.key === "/") {
        event.preventDefault();
        document.getElementById("place-search")?.focus();
        setMobileOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!help) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const buttons = dialog?.querySelectorAll<HTMLElement>(
      'button, [href], input, [tabindex="0"]',
    );
    buttons?.[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !buttons?.length) return;
      const first = buttons[0],
        last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previouslyFocused?.focus();
    };
  }, [help]);

  const switchRealm = (next: Realm) => {
    setRealm(next);
    setSelected(null);
    setRegion(null);
    setQuery("");
    setSection("land");
    setMobileOpen(false);
    setInspecting(false);
    setScenicOffset(0);
  };
  const toggleLayer = (key: keyof Layers) =>
    setLayers((current) => ({ ...current, [key]: !current[key] }));
  const toggleSaved = (id: string) =>
    setSaved((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  const reset = () => {
    scene.current?.reset();
    setRegion(null);
    setSelected(null);
    setInspecting(false);
  };
  const filteredRegions = regions.filter(
    (r) => r.realm === realm && (section === "sea" ? r.water : !r.water),
  );
  const searchResults = query.trim()
    ? places.filter((p) =>
        `${p.name}${p.subtitle}${p.realm === "human" ? "人界" : p.realm === "spirit" ? "灵界" : "仙界"}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      )
    : [];
  const regionPlaces = places.filter((p) => p.region === region);
  const realmPlaces = places.filter((p) => p.realm === realm);
  const savedPlaces = places.filter((p) => saved.includes(p.id));

  return (
    <div className="atlas-app">
      <header className="site-header">
        <button
          className="brand"
          onClick={() => {
            switchRealm("human");
            reset();
          }}
          aria-label="玄鸟山海舆图首页"
        >
          <BrandMark />
          <span className="brand-name">
            玄鸟
            <span className="brand-divider" />{" "}
            <span className="brand-subtitle">山海舆图</span>
            <small>XUANNIAO · WORLD ATLAS</small>
          </span>
        </button>
        <nav className="realm-nav" aria-label="选择世界层级">
          {realms.map((r, i) => (
            <button
              key={r.id}
              className={realm === r.id ? "active" : ""}
              onClick={() => switchRealm(r.id)}
              aria-pressed={realm === r.id}
            >
              <span className="realm-number">0{i + 1}</span>
              {r.name}
              <span className="realm-dot" />
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <span className="edition">
            十四卷校订本 <span>·</span> 地理志
          </span>
          <span className="header-rule" />
          <button
            className="icon-button"
            title="制图说明与操作帮助"
            aria-label="制图说明与操作帮助"
            onClick={() => setHelp(true)}
          >
            <HelpCircle size={18} />
          </button>
          <button
            className="icon-button fullscreen-button"
            title="全屏地图"
            aria-label="全屏地图"
            onClick={() => {
              if (document.fullscreenElement)
                document.exitFullscreen?.().catch(() => {});
              else
                document.documentElement.requestFullscreen?.().catch(() => {});
            }}
          >
            <Expand size={18} />
          </button>
        </div>
      </header>

      <main className="atlas-main">
        {mobileOpen && (
          <button
            className="sidebar-scrim"
            onClick={() => setMobileOpen(false)}
            aria-label="收起地域目录"
          />
        )}
        <aside
          className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}
          aria-label="地图浏览目录"
        >
          <div className="sidebar-scroll">
            <div className="sidebar-heading">
              <span className="eyebrow">EXPLORE THE WORLD</span>
              <div className="sidebar-title">
                <h1>山海之间</h1>
                <Compass size={22} strokeWidth={1} />
              </div>
              <p>循山川脉络，见天地辽阔。</p>
            </div>
            <div className="search-wrap">
              <Search size={16} />
              <input
                id="place-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="寻找一处山海…"
                aria-label="搜索三界中的地点"
                autoComplete="off"
              />
              {query ? (
                <button onClick={() => setQuery("")} aria-label="清空搜索">
                  <X size={14} />
                </button>
              ) : (
                <kbd>/</kbd>
              )}
            </div>
            <div className="directory-tabs" role="group" aria-label="浏览类别">
              <button
                className={section === "land" ? "active" : ""}
                onClick={() => {
                  setSection("land");
                  setQuery("");
                }}
              >
                {realm === "human"
                  ? "五洲"
                  : realm === "spirit"
                    ? "洞天"
                    : "天域"}
              </button>
              {realm === "human" && (
                <button
                  className={section === "sea" ? "active" : ""}
                  onClick={() => {
                    setSection("sea");
                    setQuery("");
                  }}
                >
                  四海
                </button>
              )}
              <button
                className={section === "saved" ? "active" : ""}
                onClick={() => {
                  setSection("saved");
                  setQuery("");
                }}
              >
                <Bookmark size={12} />
                收藏
                {saved.length > 0 && (
                  <span className="tab-count">{saved.length}</span>
                )}
              </button>
            </div>

            {query.trim() ? (
              <div className="search-results">
                <div className="list-heading">
                  全图检索<span>{searchResults.length} 处</span>
                </div>
                {searchResults.length ? (
                  searchResults.map((place) => (
                    <PlaceRow
                      key={place.id}
                      place={place}
                      onClick={() => selectPlace(place.id)}
                    />
                  ))
                ) : (
                  <div className="empty-state">
                    <Search size={24} />
                    <p>山海之间，未寻得此地</p>
                    <small>试试“青牛村”“昆仑”或“照川”</small>
                  </div>
                )}
              </div>
            ) : section === "saved" ? (
              <div>
                <div className="list-heading">
                  我的山海<span>{savedPlaces.length} 处</span>
                </div>
                {savedPlaces.length ? (
                  savedPlaces.map((place) => (
                    <PlaceRow
                      key={place.id}
                      place={place}
                      onClick={() => selectPlace(place.id)}
                    />
                  ))
                ) : (
                  <div className="empty-state">
                    <Bookmark size={26} strokeWidth={1} />
                    <p>留下一处想再去的山海</p>
                    <small>
                      点选地图地点，点击书签即可收藏。
                      <br />
                      收藏会保存在当前浏览器。
                    </small>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="list-heading">
                  {realm === "human"
                    ? section === "sea"
                      ? "四海寻踪"
                      : "五洲巡览"
                    : realm === "spirit"
                      ? "洞天一览"
                      : "天域巡览"}
                  <span>
                    {realm === "human"
                      ? section === "sea"
                        ? "06 — 09"
                        : "01 — 05"
                      : realm === "spirit"
                        ? "36 处"
                        : "02 域"}
                  </span>
                </div>
                <div className="region-list">
                  {filteredRegions.map((r, i) => (
                    <button
                      key={r.id}
                      onClick={() => chooseRegion(r.id)}
                      className={`region-row ${region === r.id ? "active" : ""}`}
                    >
                      <span
                        className={`region-art art-${r.id}`}
                        style={{ color: r.color }}
                      >
                        <RegionArt index={i} water={r.water} />
                      </span>
                      <span className="region-row-info">
                        <span className="region-row-name">
                          {r.name}
                          <span className="region-row-number">
                            {String(regions.indexOf(r) + 1).padStart(2, "0")}
                          </span>
                        </span>
                        <span className="region-row-terrain">{r.terrain}</span>
                      </span>
                      <ChevronRight size={14} />
                    </button>
                  ))}
                </div>
                {selectedRegion ? (
                  <div className="region-info">
                    <div className="region-info-title">
                      <span>{selectedRegion.name}地理</span>
                      <button
                        className="text-button"
                        onClick={() => {
                          setRegion(null);
                          scene.current?.reset();
                        }}
                      >
                        全域 <ArrowRight size={12} />
                      </button>
                    </div>
                    <p>{selectedRegion.description}</p>
                    <div className="region-place-list">
                      {regionPlaces.map((place) => (
                        <PlaceRow
                          key={place.id}
                          place={place}
                          onClick={() => selectPlace(place.id)}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="scenic-collection">
                    <div className="scenic-heading">
                      <span>
                        地景选集 <small>LANDSCAPES</small>
                      </span>
                      <button
                        onClick={() =>
                          setScenicOffset(
                            (scenicOffset + 2) % scenicPicks[realm].length,
                          )
                        }
                        aria-label="下一组地景"
                      >
                        <ArrowRight size={13} />
                      </button>
                    </div>
                    <div className="scenic-grid">
                      {[0, 1].map((offset) => {
                        const id =
                            scenicPicks[realm][
                              (scenicOffset + offset) %
                                scenicPicks[realm].length
                            ],
                          place = places.find((p) => p.id === id)!;
                        return (
                          <button
                            key={id}
                            onClick={() => {
                              selectPlace(id);
                              setInspecting(true);
                            }}
                            aria-label={`细览${place.name}景观`}
                          >
                            <LandscapeArt style={landscapeFor(place).style} />
                            <span>
                              {place.name}
                              <ArrowRight size={10} />
                            </span>
                            <small>{landscapeFor(place).features[0]}</small>
                          </button>
                        );
                      })}
                    </div>
                    <p>点选建筑与地标，走近每一处山海。</p>
                  </div>
                )}
                {realm === "spirit" && (
                  <div className="cave-directory">
                    {realmPlaces.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => selectPlace(p.id)}
                        aria-label={`浏览${p.name}`}
                        className={selected === p.id ? "active" : ""}
                      >
                        {p.name.replace("洞天 ", "")}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="sidebar-footer">
            <div className="footer-emblem">舆</div>
            <span>
              以纲要为底本，绘山河之形。
              <button onClick={() => setHelp(true)}>
                关于这幅地图 <ArrowRight size={11} />
              </button>
            </span>
          </div>
        </aside>

        <section
          className={`map-stage realm-${realm} lighting-${lighting} ${inspecting ? "inspecting" : ""}`}
          aria-label={`${currentRealm.name}地图`}
        >
          <div ref={host} className="map-host" />
          <div className="map-grain" />
          <div className="map-vignette" />
          {!ready && !error && (
            <div className="loading-state">
              <Compass className="loading-compass" size={32} strokeWidth={1} />
              <span>山川正在展开</span>
              <small>DRAWING THE WORLD</small>
            </div>
          )}
          {error && (
            <div className="error-state">
              <Mountain size={32} />
              <h2>立体地图需要 WebGL 支持</h2>
              <p>请开启浏览器硬件加速，或使用支持 WebGL 的浏览器。</p>
              <small>{error}</small>
              <button onClick={() => window.location.reload()}>重新加载</button>
            </div>
          )}
          <div className="map-topline">
            <div className="map-location">
              <button
                className="mobile-menu icon-button"
                onClick={() => setMobileOpen(true)}
                aria-label="打开地域目录"
              >
                <Menu size={20} />
              </button>
              <span>七政大世界</span>
              <ChevronRight size={12} />
              <span>{currentRealm.name}</span>
            </div>
            <div className="view-tools">
              <div
                className="lighting-switch"
                role="group"
                aria-label="景观光照"
              >
                {(
                  [
                    { id: "day", name: "日间光照", icon: Sun },
                    { id: "dusk", name: "黄昏光照", icon: Sunset },
                    { id: "night", name: "夜间光照", icon: Moon },
                  ] as const
                ).map(({ id, name, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setLighting(id)}
                    className={lighting === id ? "active" : ""}
                    aria-label={name}
                    title={name}
                    aria-pressed={lighting === id}
                  >
                    <Icon size={13} />
                  </button>
                ))}
              </div>
              <div className="view-mode" role="group" aria-label="地图视角">
                <button
                  className={!flat ? "active" : ""}
                  onClick={() => setFlat(false)}
                  aria-pressed={!flat}
                >
                  <Layers3 size={13} />
                  2.5D
                </button>
                <button
                  className={flat ? "active" : ""}
                  onClick={() => setFlat(true)}
                  aria-pressed={flat}
                >
                  <Map size={13} />
                  俯瞰
                </button>
              </div>
            </div>
          </div>
          <div className="map-heading">
            <span className="map-kicker">{currentRealm.en}</span>
            <h2>
              {realm === "human"
                ? "五洲四海"
                : realm === "spirit"
                  ? "三十六洞天"
                  : "九重天阙"}
              <span className="title-seal">舆图</span>
            </h2>
            <p>{currentRealm.subtitle}</p>
          </div>
          <div className="map-compass" aria-hidden="true">
            <span>N</span>
            <svg viewBox="0 0 64 64">
              <circle
                cx="32"
                cy="32"
                r="23"
                fill="none"
                stroke="currentColor"
                opacity=".2"
              />
              <path
                d="M32 6 38 32 32 58 26 32Z"
                fill="none"
                stroke="currentColor"
                strokeWidth=".8"
              />
              <path d="m32 7 6 25-6-5Z" fill="currentColor" />
              <path
                d="M8 32h48M32 15v34"
                stroke="currentColor"
                opacity=".4"
                strokeWidth=".6"
              />
              <circle
                cx="32"
                cy="32"
                r="3"
                fill="#e5e5d2"
                stroke="currentColor"
              />
            </svg>
            <span className="compass-east">E</span>
          </div>

          {selectedPlace && (
            <PlaceCard
              key={selectedPlace.id}
              place={selectedPlace}
              saved={saved.includes(selectedPlace.id)}
              inspecting={inspecting}
              onBookmark={() => toggleSaved(selectedPlace.id)}
              onClose={() => {
                setSelected(null);
                setInspecting(false);
              }}
              onSelect={selectPlace}
              onLocate={() => scene.current?.selectPlace(selectedPlace.id)}
              onInspect={() => {
                setInspecting(true);
                scene.current?.inspectPlace(selectedPlace.id);
              }}
            />
          )}
          {inspecting && selectedPlace && (
            <div className="closeup-location">
              <Eye size={12} />
              <span>局部细览</span>
              <strong>{selectedPlace.name}</strong>
              <button onClick={reset} aria-label="退出局部细览">
                返回全图 <X size={12} />
              </button>
            </div>
          )}

          <MiniMap
            realm={realm}
            viewport={viewport}
            selected={selected}
            onNavigate={(point) => {
              setSelected(null);
              setRegion(null);
              setInspecting(false);
              scene.current?.focus(point, Math.max(zoom, 1.5));
            }}
          />
          <div className="map-controls">
            <button
              title="放大地图（+）"
              aria-label="放大地图"
              onClick={() => scene.current?.zoomBy(1.3)}
              disabled={zoom >= 6.95}
            >
              <Plus size={19} />
            </button>
            <span className="zoom-value">
              {Math.round(zoom * 100)}
              <small>%</small>
            </span>
            <button
              title="缩小地图（−）"
              aria-label="缩小地图"
              onClick={() => scene.current?.zoomBy(1 / 1.3)}
              disabled={zoom <= 0.66}
            >
              <Minus size={19} />
            </button>
            <span className="control-divider" />
            <button title="回到全图（0）" aria-label="回到全图" onClick={reset}>
              <Maximize2 size={17} />
            </button>
          </div>
          <div className="map-scale">
            <span>
              {inspecting
                ? "局部细览"
                : region
                  ? selectedRegion?.name
                  : "全域视图"}
            </span>
            <div className="scale-rule">
              <i />
              <i />
              <i />
            </div>
            <small>示意比例 · 非实测距离</small>
          </div>

          <div className="bottom-toolbar">
            <button
              className={`layers-toggle ${layerPanel ? "active" : ""}`}
              onClick={() => setLayerPanel(!layerPanel)}
              aria-expanded={layerPanel}
            >
              <Layers3 size={16} />
              <span>图层</span>
              <ChevronDown size={12} />
            </button>
            <span className="toolbar-divider" />
            <button
              className={layers.buildings ? "active" : ""}
              onClick={() => toggleLayer("buildings")}
              aria-pressed={layers.buildings}
              title="显示或隐藏城郭建筑"
            >
              <Castle size={15} />
              <span>城郭</span>
            </button>
            <button
              className={layers.terrain ? "active" : ""}
              onClick={() => toggleLayer("terrain")}
              aria-pressed={layers.terrain}
              title="显示或隐藏立体地形"
            >
              <Mountain size={15} />
              <span>地形</span>
            </button>
            <button
              className={layers.water ? "active" : ""}
              onClick={() => toggleLayer("water")}
              aria-pressed={layers.water}
              title="显示或隐藏水文"
            >
              <Waves size={15} />
              <span>水文</span>
            </button>
            <button
              className={layers.places ? "active" : ""}
              onClick={() => toggleLayer("places")}
              aria-pressed={layers.places}
              title="显示或隐藏地点"
            >
              <MapPin size={15} />
              <span>地点</span>
            </button>
          </div>
          {layerPanel && (
            <div className="layer-panel">
              <div className="layer-panel-title">
                <span>地图图层</span>
                <button
                  className="icon-button"
                  onClick={() => setLayerPanel(false)}
                  aria-label="关闭图层面板"
                >
                  <X size={14} />
                </button>
              </div>
              {(
                [
                  {
                    key: "terrain",
                    label: "立体地形",
                    hint: "山体、海岸与等高线",
                    icon: Mountain,
                  },
                  {
                    key: "buildings",
                    label: "城郭建筑",
                    hint: "房舍、山门、城墙与遗迹",
                    icon: Castle,
                  },
                  {
                    key: "vegetation",
                    label: "林野植被",
                    hint: "阔叶林冠与雪域针叶林",
                    icon: Trees,
                  },
                  {
                    key: "atmosphere",
                    label: "云雾风物",
                    hint: "流云、山雾与北洲细雪",
                    icon: Cloud,
                  },
                  {
                    key: "water",
                    label: "水文纹理",
                    hint: "河流、海眼与海岸水纹",
                    icon: Waves,
                  },
                  {
                    key: "places",
                    label: "地点标记",
                    hint: "山川、城池与遗迹",
                    icon: MapPin,
                  },
                  {
                    key: "labels",
                    label: "洲海名称",
                    hint: "洲域及海域大字标注",
                    icon: Globe2,
                  },
                  {
                    key: "connections",
                    label: "地理联系",
                    hint: "原稿提及的相连地点，非实测道路",
                    icon: Navigation,
                  },
                ] as const
              ).map(({ key, label, hint, icon: Icon }) => (
                <button
                  className="layer-option"
                  key={key}
                  onClick={() => toggleLayer(key)}
                  aria-pressed={layers[key]}
                >
                  <Icon size={17} />
                  <span>
                    <strong>{label}</strong>
                    <small>{hint}</small>
                  </span>
                  <span className={`checkbox ${layers[key] ? "checked" : ""}`}>
                    {layers[key] && <Check size={12} />}
                  </span>
                </button>
              ))}
              <div className="layer-note">
                建筑、植被、河流与局部地景均为视觉演绎。
              </div>
            </div>
          )}

          <button
            className={`motion-toggle ${motion ? "" : "paused"}`}
            aria-label={motion ? "暂停环境动态" : "开启环境动态"}
            title={motion ? "暂停环境动态" : "开启环境动态"}
            onClick={() => setMotion(!motion)}
          >
            {motion ? <Pause size={11} /> : <Play size={11} />}
            <span>{motion ? "风物流动" : "静观山海"}</span>
          </button>
          <div className="map-interaction-hint">
            <span>
              <span className="mouse-icon" />
              拖动探索
            </span>
            <i />
            <span>滚轮缩放</span>
            <i />
            <span>点选地标</span>
          </div>
          <div className="map-caption">
            山川有据 · 风物成景<span>QIZHENG ATLAS / 02</span>
          </div>
        </section>
      </main>
      <footer className="status-bar">
        <span>
          <span className="status-dot" />
          七政大世界 · {currentRealm.name}
          <span className="status-divider">/</span>
          {realmPlaces.length} 处地理标记
        </span>
        <span>
          据《玄鸟设定与十四卷大纲校订稿》绘制{" "}
          <span className="status-divider">·</span>
          <button onClick={() => setHelp(true)}>
            制图说明 <ArrowDownLeft size={10} />
          </button>
        </span>
      </footer>

      {help && (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setHelp(false);
          }}
        >
          <div
            className="help-modal"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
          >
            <button
              className="modal-close icon-button"
              onClick={() => setHelp(false)}
              aria-label="关闭制图说明"
            >
              <X size={20} />
            </button>
            <span className="eyebrow">NOTES ON THE ATLAS</span>
            <h2 id="help-title">以文字为经，山海为纬。</h2>
            <p className="modal-lead">这是一幅依据小说纲要绘制的地理示意图。</p>
            <div className="help-section">
              <h3>
                <Compass size={16} />
                如何阅图
              </h3>
              <div className="help-shortcuts">
                <span>
                  拖动地图<small>平移视野</small>
                </span>
                <span>
                  滚轮 / 双指<small>缩放地图</small>
                </span>
                <span>
                  点选地标<small>阅读地理详情</small>
                </span>
                <span>
                  2.5D / 俯瞰<small>切换地形视角</small>
                </span>
              </div>
              <p>
                <kbd>/</kbd> 搜索地点 <kbd>+</kbd>
                <kbd>−</kbd> 缩放 <kbd>0</kbd> 回到全图 <kbd>Esc</kbd> 关闭详情
              </p>
            </div>
            <div className="help-section">
              <h3>
                <Map size={16} />
                制图依据与留白
              </h3>
              <p>
                五洲四海、明确记载的地点归属及相对方位，依据校订稿
                §1.1、§2.5—§2.10 与分卷纲要。地点详情附有出处。
              </p>
              <p>
                海岸线、河流、山体高度、地形配色、植被、距离与具体坐标属于视觉示意。龙津海、朝夕池的相对位置，以及仙界各地的排列，原稿未明确，图上布局不视为正史。
              </p>
              <p>
                灵界三十六洞天未逐一命名，使用浏览编号；仙界九重天阙采用五城十二楼与已知外围地标的结构示意。灵墟洞天是青崖山上的人界山门，不擅自归入灵界。
              </p>
              <p>
                “苏氏山谷”为地理检索描述，皇朝标记表示所在区域，均不补写正式地名、都城或疆界。地理联系虚线仅表示原稿中的关联，不代表已知道路。
              </p>
              <p>
                房舍、城墙、飞檐、农田、水车、船只、瀑流与洞天生态是微缩景观演绎，不构成原稿新增的地名、都城或建筑平面图。日间、黄昏与夜间仅为阅图光照。
              </p>
            </div>
            <div className="modal-footer">
              <span>只绘山川、城池、海域与遗址。</span>
              <button onClick={() => setHelp(false)}>
                继续探索 <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlaceRow({ place, onClick }: { place: Place; onClick: () => void }) {
  const Icon = icons[place.kind];
  return (
    <button className="place-row" onClick={onClick}>
      <Icon size={15} strokeWidth={1.5} />
      <span>
        <strong>{place.name}</strong>
        <small>{place.subtitle}</small>
      </span>
      <ChevronRight size={13} />
    </button>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
