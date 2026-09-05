export interface SmoothElevationBasisFeature {
  name: string;
  latDeg: number;
  lonDeg: number;
  radiusDeg: number;
  heightMeters: number;
}

export const SMOOTH_ELEVATION_MODEL_NAME = "smooth-spherical-basis-v1";

export const SMOOTH_ELEVATION_FEATURES: SmoothElevationBasisFeature[] = [
  { name: "north-american-interior", latDeg: 43, lonDeg: -96, radiusDeg: 30, heightMeters: 155 },
  { name: "upper-midwest", latDeg: 45, lonDeg: -93, radiusDeg: 5, heightMeters: 45 },
  { name: "appalachians", latDeg: 38, lonDeg: -81, radiusDeg: 5, heightMeters: 520 },
  { name: "rockies", latDeg: 40, lonDeg: -107, radiusDeg: 5, heightMeters: 1_150 },
  { name: "colorado-plateau", latDeg: 37, lonDeg: -111, radiusDeg: 6, heightMeters: 720 },
  { name: "sierra-nevada", latDeg: 37, lonDeg: -119, radiusDeg: 4, heightMeters: 920 },
  { name: "death-valley-basin", latDeg: 36.5, lonDeg: -117, radiusDeg: 2.4, heightMeters: -820 },
  { name: "mexican-plateau", latDeg: 22, lonDeg: -102, radiusDeg: 7, heightMeters: 1_350 },
  { name: "andean-north", latDeg: 1, lonDeg: -77, radiusDeg: 8, heightMeters: 1_850 },
  { name: "andean-central", latDeg: -17, lonDeg: -68, radiusDeg: 12, heightMeters: 2_450 },
  { name: "andean-south", latDeg: -33, lonDeg: -70, radiusDeg: 8, heightMeters: 1_600 },
  { name: "amazon-basin", latDeg: -5, lonDeg: -62, radiusDeg: 18, heightMeters: 110 },
  { name: "greenland-ice-sheet", latDeg: 72, lonDeg: -42, radiusDeg: 11, heightMeters: 1_750 },
  { name: "european-lowlands", latDeg: 50, lonDeg: 12, radiusDeg: 18, heightMeters: 120 },
  { name: "alps", latDeg: 46.5, lonDeg: 10.5, radiusDeg: 4.2, heightMeters: 1_150 },
  { name: "scandinavian-highlands", latDeg: 63, lonDeg: 10, radiusDeg: 7, heightMeters: 760 },
  { name: "anatolian-plateau", latDeg: 39, lonDeg: 35, radiusDeg: 9, heightMeters: 1_050 },
  { name: "east-african-highlands", latDeg: 2, lonDeg: 37, radiusDeg: 11, heightMeters: 1_250 },
  { name: "ethiopian-highlands", latDeg: 9, lonDeg: 39, radiusDeg: 5.5, heightMeters: 1_650 },
  { name: "southern-african-plateau", latDeg: -26, lonDeg: 27, radiusDeg: 15, heightMeters: 980 },
  { name: "sahara-plateau", latDeg: 23, lonDeg: 12, radiusDeg: 20, heightMeters: 310 },
  { name: "iranian-plateau", latDeg: 32, lonDeg: 55, radiusDeg: 10, heightMeters: 1_250 },
  { name: "tibetan-plateau", latDeg: 32, lonDeg: 88, radiusDeg: 11, heightMeters: 4_250 },
  { name: "himalaya", latDeg: 28, lonDeg: 86, radiusDeg: 4.5, heightMeters: 2_300 },
  { name: "mongolian-plateau", latDeg: 46, lonDeg: 103, radiusDeg: 12, heightMeters: 1_050 },
  { name: "siberian-plateau", latDeg: 62, lonDeg: 102, radiusDeg: 18, heightMeters: 420 },
  { name: "japanese-arc", latDeg: 37, lonDeg: 139, radiusDeg: 4.5, heightMeters: 680 },
  { name: "southeast-asian-highlands", latDeg: 22, lonDeg: 101, radiusDeg: 8, heightMeters: 1_050 },
  { name: "deccan-plateau", latDeg: 16, lonDeg: 77, radiusDeg: 10, heightMeters: 650 },
  { name: "australian-interior", latDeg: -25, lonDeg: 134, radiusDeg: 18, heightMeters: 330 },
  { name: "new-guinea-highlands", latDeg: -5, lonDeg: 144, radiusDeg: 5, heightMeters: 1_950 },
  { name: "new-zealand-alps", latDeg: -43.5, lonDeg: 170, radiusDeg: 3.5, heightMeters: 850 },
  { name: "antarctic-plateau", latDeg: -82, lonDeg: 40, radiusDeg: 26, heightMeters: 2_350 },
  { name: "ocean-baseline", latDeg: 0, lonDeg: 0, radiusDeg: 180, heightMeters: -8 },
];
