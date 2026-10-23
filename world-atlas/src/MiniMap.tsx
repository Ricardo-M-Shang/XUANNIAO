import { useId, useRef } from "react";
import { Crosshair } from "lucide-react";
import { celestialLands, humanLands, places } from "./data";
import type { Point, Realm } from "./data";

export function MiniMap({
  realm,
  viewport,
  selected,
  onNavigate,
}: {
  realm: Realm;
  viewport: Point[];
  selected: string | null;
  onNavigate: (point: Point) => void;
}) {
  const id = useId().replaceAll(":", ""),
    svg = useRef<SVGSVGElement>(null);
  const lands = realm === "human" ? humanLands : celestialLands;
  const selectedPlace = places.find((place) => place.id === selected);
  return (
    <div className="minimap">
      <div className="minimap-title">
        <span>全图导航</span>
        <Crosshair size={11} />
      </div>
      <svg
        ref={svg}
        viewBox="-72 -48 144 104"
        role="button"
        tabIndex={0}
        aria-label="小地图导航，点击定位区域"
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onNavigate([0, 0]);
          }
        }}
        onClick={(event) => {
          const matrix = svg.current?.getScreenCTM();
          if (!matrix) return;
          const point = new DOMPoint(
            event.clientX,
            event.clientY,
          ).matrixTransform(matrix.inverse());
          onNavigate([point.x, point.y]);
        }}
      >
        <defs>
          <clipPath id={`mini${id}`}>
            <rect x="-72" y="-48" width="144" height="104" rx="3" />
          </clipPath>
        </defs>
        <g clipPath={`url(#mini${id})`}>
          <path fill="#8baea0" fillOpacity=".14" d="M-72-48H72V56H-72Z" />
          {realm === "spirit"
            ? places
                .filter((p) => p.realm === "spirit")
                .map((p) => (
                  <ellipse
                    key={p.id}
                    cx={p.position[0]}
                    cy={p.position[1]}
                    rx="3.2"
                    ry="2.2"
                    fill="#9eae89"
                    stroke="#809574"
                    strokeWidth=".25"
                  />
                ))
            : lands.map((land) => (
                <polygon
                  key={land.id}
                  points={land.points.map((p) => p.join(",")).join(" ")}
                  fill={realm === "celestial" ? "#bcba92" : land.color}
                  stroke="#739077"
                  strokeWidth=".35"
                />
              ))}
          {viewport.length === 4 && (
            <polygon
              className="minimap-viewport"
              points={viewport.map((p) => p.join(",")).join(" ")}
              fill="#f7edb4"
              fillOpacity=".12"
              stroke="#466d57"
              strokeWidth=".9"
            />
          )}
          {selectedPlace && (
            <>
              <circle
                cx={selectedPlace.position[0]}
                cy={selectedPlace.position[1]}
                r="2"
                fill="#936d40"
              />
              <circle
                cx={selectedPlace.position[0]}
                cy={selectedPlace.position[1]}
                r="4"
                fill="none"
                stroke="#936d40"
                strokeWidth=".5"
              />
            </>
          )}
        </g>
      </svg>
      <span className="minimap-hint">点选区域 · 移动视野</span>
    </div>
  );
}
