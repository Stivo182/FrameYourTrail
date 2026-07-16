const fr = {
  languageName: "Français",
  site: {
    toolbarLabel: "Panneau de contrôle",
    tagline: "Transformez n'importe quel itinéraire en poster",
    uploadFile: "Choisir fichier",
    exportAria: "Export du poster",
    exportLabel: "Exporter :",
    clipboard: "Presse-papiers",
    printPoster: "Imprimer",
    emptyTitle: "Importez un fichier d'itinéraire pour créer une infographie",
    emptyBody:
      "Carte, statistiques, graphiques et export seront disponibles après l'analyse du fichier.",
    languageLabel: "Langue"
  },
  messages: {
    unsupportedFile: "Choisissez un fichier GPX, TCX, FIT ou XML contenant une trace.",
    parseError: "Impossible de lire le fichier.",
    notXml: "Le fichier n'est pas un XML.",
    invalidXml: "Le fichier XML n'a pas pu être analysé.",
    emptyTrack: "Le fichier d'itinéraire ne contient aucun point d'itinéraire.",
    missingCoordinates: "Un point d'itinéraire ne contient pas de coordonnées.",
    coordinatesOutOfBounds:
      "Un point d'itinéraire contient des coordonnées hors limites géographiques.",
    insufficientPoints: "Le fichier d'itinéraire doit contenir au moins deux points d'itinéraire.",
    missingElevation:
      "Le fichier d'itinéraire ne contient pas d'altitude. Les métriques et graphiques d'altitude seront masqués.",
    missingTime:
      "Le fichier d'itinéraire ne contient pas d'heure. La vitesse et le temps en mouvement seront masqués.",
    largeFile: "Le fichier dépasse 50 Mo. Le traitement et l'export peuvent prendre plus de temps.",
    terrainElevation:
      "L'altitude a été restaurée à partir des données de terrain et peut différer de l'altitude de l'appareil.",
    terrainElevationUnavailable:
      "L'altitude du terrain est indisponible. Les indicateurs actuels sont conservés.",
    exportError: "Impossible d'exporter le poster.",
    previewRenderError: "Impossible d'afficher l'aperçu du poster."
  },
  analysis: {
    sourceLabel: "Indicateurs",
    sourceSelectLabel: "Source des indicateurs",
    modeSelectLabel: "Source des indicateurs",
    modes: {
      recomputed_filtered: "Recommandé",
      recomputed_raw: "Depuis les points de trace",
      recomputed_terrain: "Altitude du terrain",
      recomputed_terrain_request: "Charger l'altitude du terrain",
      imported_summary: "Totaux du fichier"
    },
    modeDescriptions: {
      recomputed_filtered: "Nettoie les erreurs GPS évidentes et utilise les points de trace.",
      recomputed_raw:
        "Recalcule les indicateurs depuis les points du fichier après le nettoyage standard.",
      recomputed_terrain: "Recalcule les indicateurs avec l'altitude du terrain.",
      recomputed_terrain_request:
        "Charge l'altitude du terrain et nécessite une requête externe via internet.",
      imported_summary:
        "Utilise les totaux enregistrés par l'appareil ou l'application et peut différer des points de trace."
    }
  },
  mapStyle: {
    selectLabel: "Style de carte",
    styles: {
      openfreemap_poster: {
        label: "OpenFreeMap",
        description: "OpenFreeMap adouci pour la palette du poster."
      },
      osm_standard: {
        label: "OSM Standard",
        description: "Carte OpenStreetMap générale et familière."
      },
      cyclosm: {
        label: "CyclOSM",
        description: "Carte pensée pour les itinéraires vélo."
      }
    }
  },
  poster: {
    mapAria: "Carte de l'itinéraire",
    elevationTitle: "Profil d'altitude",
    elevationChartAria: "Graphique du profil d'altitude",
    statsAria: "Statistiques de l'itinéraire",
    coordinatesAria: "Coordonnées représentatives de l'itinéraire",
    latitudeLabel: "Latitude",
    longitudeLabel: "Longitude",
    pointSummary: {
      one: "{count} point de trace",
      few: "{count} points de trace",
      many: "{count} points de trace",
      other: "{count} points de trace"
    }
  },
  metrics: {
    distance: "Distance",
    movingTime: "Temps en mouvement",
    stoppedTime: "Temps arrêté",
    totalTime: "Temps total",
    averageSpeed: "Vitesse moyenne",
    movingSpeed: "Vitesse en mouvement",
    maxSpeed: "Vitesse max.",
    elevationGain: "Dénivelé positif",
    elevationLoss: "Dénivelé négatif",
    minElevation: "Altitude min.",
    maxElevation: "Altitude max.",
    elevationRange: "Amplitude d'altitude"
  },
  map: {
    start: "Départ",
    finish: "Arrivée",
    fallbackAria: "Itinéraire sans fond de carte",
    fallbackCaption: "Le fond de carte est indisponible, l'itinéraire est affiché sans OSM."
  },
  charts: {
    elevationUnavailable: "Données d'altitude indisponibles",
    elevationAria: "Profil d'altitude de l'itinéraire",
    elevationSeries: "Profil d'altitude",
    elevationYAxis: "Altitude, m",
    elevationTooltipDistance: "Distance",
    elevationTooltipElevation: "Altitude",
    minElevation: "Altitude min.",
    maxElevation: "Altitude max.",
    speedUnavailable: "Vitesse indisponible",
    speedAria: "Graphique de vitesse de l'itinéraire",
    speedTitle: "Vitesse",
    speedLegendRibbon: "ruban",
    speedLegendAverage: "moyenne",
    speedLegendMoving: "en mouvement",
    slopeUnavailable: "Pente indisponible",
    slopeAria: "Graphique de pente de l'itinéraire",
    slopeTitle: "Pente",
    slopeLegendUp: "montée",
    slopeLegendDown: "descente"
  },
  templates: {
    routeReport: "Rapport d'itinéraire"
  },
  units: {
    km: "km",
    m: "m",
    kmh: "km/h",
    empty: "—"
  }
};

export default fr;
