import {
  ArrowDownToLine,
  ArrowUpToLine,
  Footprints,
  Gauge,
  MapPin,
  OctagonPause,
  Route,
  Timer,
  TrendingDown,
  TrendingUp,
  UnfoldVertical,
  Wind,
  Zap
} from "lucide";
import { renderLucideIcon } from "./lucide-icon.js";

const ICONS = {
  distance: renderLucideIcon("distance", Route, "lucide-route"),
  movingTime: renderLucideIcon("movingTime", Footprints, "lucide-footprints"),
  stoppedTime: renderLucideIcon("stoppedTime", OctagonPause, "lucide-octagon-pause"),
  totalTime: renderLucideIcon("totalTime", Timer, "lucide-timer"),
  averageSpeed: renderLucideIcon("averageSpeed", Gauge, "lucide-gauge"),
  movingSpeed: renderLucideIcon("movingSpeed", Wind, "lucide-wind"),
  maxSpeed: renderLucideIcon("maxSpeed", Zap, "lucide-zap"),
  gain: renderLucideIcon("gain", TrendingUp, "lucide-trending-up"),
  loss: renderLucideIcon("loss", TrendingDown, "lucide-trending-down"),
  minElevation: renderLucideIcon("minElevation", ArrowDownToLine, "lucide-arrow-down-to-line"),
  maxElevation: renderLucideIcon("maxElevation", ArrowUpToLine, "lucide-arrow-up-to-line"),
  elevationRange: renderLucideIcon("elevationRange", UnfoldVertical, "lucide-unfold-vertical"),
  location: renderLucideIcon("location", MapPin, "lucide-map-pin")
};

/**
 * @param {keyof typeof ICONS} name
 * @returns {string}
 */
export function icon(name) {
  return ICONS[name] ?? "";
}
