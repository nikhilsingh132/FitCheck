import type { SvgIconComponent } from "@mui/icons-material";
import CheckroomIcon from "@mui/icons-material/Checkroom";
import LayersIcon from "@mui/icons-material/Layers";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import HikingIcon from "@mui/icons-material/Hiking";
import WatchIcon from "@mui/icons-material/Watch";
import StyleIcon from "@mui/icons-material/Style";
import WorkIcon from "@mui/icons-material/Work";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import FavoriteIcon from "@mui/icons-material/Favorite";
import CelebrationIcon from "@mui/icons-material/Celebration";
import FlightTakeoffIcon from "@mui/icons-material/FlightTakeoff";
import WbSunnyIcon from "@mui/icons-material/WbSunny";

export type Category =
  | "Tops"
  | "Bottoms"
  | "Outerwear"
  | "Shoes"
  | "Watches"
  | "Accessories";

export const CATEGORIES: {
  value: Category;
  label: string;
  icon: SvgIconComponent;
}[] = [
  { value: "Tops", label: "Tops", icon: CheckroomIcon },
  { value: "Bottoms", label: "Bottoms", icon: LayersIcon },
  { value: "Outerwear", label: "Outerwear", icon: AutoAwesomeIcon },
  { value: "Shoes", label: "Shoes", icon: HikingIcon },
  { value: "Watches", label: "Watches", icon: WatchIcon },
  { value: "Accessories", label: "Accessories", icon: StyleIcon },
];

export const OCCASIONS: {
  value: string;
  label: string;
  icon: SvgIconComponent;
}[] = [
  { value: "Office", label: "Office", icon: WorkIcon },
  { value: "Gym", label: "Gym", icon: FitnessCenterIcon },
  { value: "Date", label: "Date", icon: FavoriteIcon },
  { value: "Party", label: "Party", icon: CelebrationIcon },
  { value: "Travel", label: "Travel", icon: FlightTakeoffIcon },
  { value: "Casual", label: "Casual", icon: WbSunnyIcon },
];
