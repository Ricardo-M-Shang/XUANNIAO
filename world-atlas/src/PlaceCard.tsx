import { ArrowRight, Bookmark, Eye, MapPin, Navigation, X } from "lucide-react";
import { kindLabels, places, realms, regions } from "./data";
import type { Place } from "./data";
import { landscapeFor } from "./landscapes";
import { LandscapeArt } from "./LandscapeArt";

export function PlaceCard({
  place,
  saved,
  inspecting,
  onBookmark,
  onClose,
  onSelect,
  onLocate,
  onInspect,
}: {
  place: Place;
  saved: boolean;
  inspecting: boolean;
  onBookmark: () => void;
  onClose: () => void;
  onSelect: (id: string) => void;
  onLocate: () => void;
  onInspect: () => void;
}) {
  const profile = landscapeFor(place);
  return (
    <article
      className="place-card enriched-card"
      aria-label={`${place.name}地理详情`}
    >
      <div className="place-visual">
        <LandscapeArt style={profile.style} />
        <div className="place-card-meta">
          <span>
            <MapPin size={11} />
            {realms.find((r) => r.id === place.realm)?.name} /{" "}
            {regions.find((r) => r.id === place.region)?.name}
          </span>
          <div>
            <button
              className={`card-icon ${saved ? "saved" : ""}`}
              aria-label={saved ? `取消收藏${place.name}` : `收藏${place.name}`}
              title="收藏地点"
              onClick={onBookmark}
            >
              <Bookmark size={16} fill={saved ? "currentColor" : "none"} />
            </button>
            <button
              className="card-icon"
              onClick={onClose}
              aria-label="关闭地点详情"
            >
              <X size={17} />
            </button>
          </div>
        </div>
        <span className="visual-edition">
          LANDSCAPE STUDY <span>·</span> {kindLabels[place.kind]}
        </span>
      </div>
      <div className="place-card-content">
        <div className="place-title-row">
          <div>
            <span className="place-kind-label">{kindLabels[place.kind]}</span>
            <h3>{place.name}</h3>
          </div>
          <span className="detail-seal">地景</span>
        </div>
        <p className="detail-subtitle">{place.subtitle}</p>
        <div className="landscape-feature-tags">
          {profile.features.map((feature) => (
            <span key={feature}>{feature}</span>
          ))}
        </div>
        <button
          className={`inspect-place-button ${inspecting ? "active" : ""}`}
          onClick={onInspect}
          aria-pressed={inspecting}
        >
          <Eye size={14} />
          <span>
            {inspecting ? "正在细览此处" : "走近此地 · 查看建筑与地形"}
          </span>
          <ArrowRight size={13} />
        </button>
        <h4 className="landscape-heading">{profile.title}</h4>
        <p>{place.description}</p>
        <details className="landscape-note">
          <summary>此处的制图说明</summary>
          <p>{profile.note}</p>
        </details>
        <div className="source-line">
          <span className="source-dot" />
          原稿出处<span>{place.source}</span>
        </div>
        {place.related && (
          <div className="related-places">
            <span>相邻与关联地标</span>
            <div>
              {place.related.map((id) => {
                const related = places.find((p) => p.id === id);
                return related ? (
                  <button key={id} onClick={() => onSelect(id)}>
                    {related.name}
                    <ArrowRight size={11} />
                  </button>
                ) : null;
              })}
            </div>
          </div>
        )}
        <div className="card-bottom">
          <span>
            <span className="little-cross">⌖</span>
            {place.schematic ? "示意定位" : "原稿方位 · 示意坐标"}
          </span>
          <button onClick={onLocate}>
            <Navigation size={12} />
            定位此处
          </button>
        </div>
      </div>
    </article>
  );
}
