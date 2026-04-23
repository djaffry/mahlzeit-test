import {
  Bird,
  Search,
  Menu,
  ExternalLink,
  Check,
  MapPin,
  Dices,
  SlidersHorizontal,
  X,
  ChevronDown,
  ChevronRight,
  Globe,
  SunMoon,
  MessageSquare,
  Keyboard,
  Filter,
  Map as MapIcon,
  Coffee,
  Soup,
  Pizza,
  Beef,
  Sandwich,
  Utensils,
  Flame,
  ChefHat,
  Salad,
  Fish,
  Egg,
  Wheat,
  CookingPot,
  Home,
  Beer,
  Leaf,
  Waves,
  Truck,
  RotateCcw,
  Train,
  Hamburger,
  Bean,
  Crown,
  Camera,
  Type,
  Pencil,
  Link,
  LogOut,
  Copy,
  Heart,
  History,
  ArrowLeft,
  Disc3,
  TreePine,
  Pin,
} from "lucide"
import type { IconNode } from "lucide"

function attrsToString(attrs: Record<string, string | number | undefined>): string {
  return Object.entries(attrs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ")
}

function svg(icon: IconNode, size = 20, strokeWidth = 1.5): string {
  const children = icon
    .map(([tag, attrs]) => `<${tag} ${attrsToString(attrs as Record<string, string | number | undefined>)}/>`)
    .join("")
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`
}

export const icons = {
  bird: svg(Bird, 18),
  birdLarge: svg(Bird, 48),
  search: svg(Search),
  menu: svg(Menu),
  externalLink: svg(ExternalLink, 16),
  check: svg(Check, 16),
  mapPin: svg(MapPin, 16),
  dices: svg(Dices),
  slidersHorizontal: svg(SlidersHorizontal, 16),
  x: svg(X, 14),
  chevronDown: svg(ChevronDown, 16),
  chevronRight: svg(ChevronRight, 16),
  globe: svg(Globe),
  sunMoon: svg(SunMoon),
  messageSquare: svg(MessageSquare),
  keyboard: svg(Keyboard),
  filter: svg(Filter, 16),
  map: svg(MapIcon),
  // Restaurant icons (16px)
  coffee: svg(Coffee, 16),
  soup: svg(Soup, 16),
  pizza: svg(Pizza, 16),
  beef: svg(Beef, 16),
  sandwich: svg(Sandwich, 16),
  utensils: svg(Utensils, 16),
  flame: svg(Flame, 16),
  "chef-hat": svg(ChefHat, 16),
  salad: svg(Salad, 16),
  fish: svg(Fish, 16),
  egg: svg(Egg, 16),
  wheat: svg(Wheat, 16),
  "cooking-pot": svg(CookingPot, 16),
  home: svg(Home, 16),
  beer: svg(Beer, 16),
  leaf: svg(Leaf, 16),
  waves: svg(Waves, 16),
  truck: svg(Truck, 16),
  train: svg(Train, 16),
  hamburger: svg(Hamburger, 16),
  bean: svg(Bean, 16),
  crown: svg(Crown, 16),
  "tree-pine": svg(TreePine, 16),
  heart: svg(Heart, 16),
  history: svg(History, 18),
  arrowLeft: svg(ArrowLeft, 14),
  checkSmall: svg(Check, 12, 2.5),
  rotateCcw: svg(RotateCcw),
  camera: svg(Camera, 18),
  type: svg(Type, 18),
  pencil: svg(Pencil, 14),
  link: svg(Link, 14),
  logOut: svg(LogOut, 14),
  copy: svg(Copy, 14),
  disc3: svg(Disc3, 14),
  pin: svg(Pin, 16),
} as const

export function getRestaurantIcon(name: string): string {
  return (icons as Record<string, string>)[name] ?? icons.utensils
}

export function restaurantIconSpan(icon: string | undefined, extraClass?: string): string {
  const name = icon ?? ""
  const cls = extraClass ? `restaurant-icon ${extraClass}` : "restaurant-icon"
  return `<span class="${cls}" data-icon="${name.replace(/"/g, "&quot;")}" aria-hidden="true">${getRestaurantIcon(name)}</span>`
}
