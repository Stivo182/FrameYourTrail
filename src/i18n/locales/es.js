const es = {
  languageName: "Español",
  site: {
    toolbarLabel: "Panel de control",
    tagline: "Convierte cualquier ruta en un póster",
    uploadFile: "Elegir archivo",
    exportAria: "Exportar póster",
    exportLabel: "Exportar:",
    clipboard: "Portapapeles",
    emptyTitle: "Carga un archivo de ruta para crear una infografía",
    emptyBody:
      "Mapa, estadísticas, gráficos y exportación estarán disponibles tras analizar el archivo.",
    languageLabel: "Idioma"
  },
  messages: {
    unsupportedFile: "Elige un archivo GPX, TCX, FIT o XML con una ruta.",
    parseError: "No se pudo leer el archivo.",
    notXml: "El archivo no es XML.",
    invalidXml: "No se pudo analizar el archivo XML.",
    emptyTrack: "El archivo de ruta no contiene puntos de ruta.",
    missingCoordinates: "Un punto de ruta no contiene coordenadas.",
    coordinatesOutOfBounds:
      "Un punto de ruta contiene coordenadas fuera de los límites geográficos.",
    insufficientPoints: "El archivo de ruta debe contener al menos dos puntos de ruta.",
    missingElevation:
      "El archivo de ruta no tiene elevación. Se ocultarán métricas y gráficos de elevación.",
    missingTime:
      "El archivo de ruta no tiene tiempo. Se ocultarán velocidad y tiempo en movimiento.",
    largeFile: "El archivo supera los 50 MB. El procesamiento y la exportación pueden tardar más.",
    terrainElevation:
      "La elevación se restauró con datos de terreno y puede diferir de la altitud del dispositivo.",
    terrainElevationUnavailable:
      "La elevación del terreno no está disponible. Se mantienen las métricas actuales.",
    exportError: "No se pudo exportar el póster.",
    previewRenderError: "No se pudo renderizar la vista previa del póster."
  },
  analysis: {
    sourceLabel: "Métricas",
    sourceSelectLabel: "Fuente de métricas",
    modeSelectLabel: "Fuente de métricas",
    modes: {
      recomputed_filtered: "Recomendado",
      recomputed_raw: "Desde puntos de ruta",
      recomputed_terrain: "Elevación del terreno",
      recomputed_terrain_request: "Obtener elevación del terreno",
      imported_summary: "Totales del archivo"
    },
    modeDescriptions: {
      recomputed_filtered: "Limpia errores GPS evidentes y usa puntos de ruta.",
      recomputed_raw:
        "Recalcula las métricas desde los puntos del archivo tras la limpieza estándar.",
      recomputed_terrain: "Recalcula las métricas con elevación del terreno.",
      recomputed_terrain_request:
        "Obtiene elevación del terreno y requiere una consulta externa por internet.",
      imported_summary:
        "Usa los totales registrados por el dispositivo o la app y puede diferir de los puntos de ruta."
    }
  },
  mapStyle: {
    selectLabel: "Estilo de mapa",
    styles: {
      openfreemap_poster: {
        label: "OpenFreeMap",
        description: "OpenFreeMap suave ajustado a la paleta del póster."
      },
      osm_standard: {
        label: "OSM Standard",
        description: "Mapa general clásico de OpenStreetMap."
      },
      cyclosm: {
        label: "CyclOSM",
        description: "Mapa orientado a rutas e infraestructura ciclista."
      }
    }
  },
  poster: {
    mapAria: "Mapa de ruta",
    elevationTitle: "Perfil de elevación",
    elevationChartAria: "Gráfico del perfil de elevación",
    statsAria: "Estadísticas de ruta",
    coordinatesAria: "Coordenadas representativas de la ruta",
    latitudeLabel: "Latitud",
    longitudeLabel: "Longitud",
    pointSummary: {
      one: "1 punto de ruta",
      few: "{count} puntos de ruta",
      many: "{count} puntos de ruta",
      other: "{count} puntos de ruta"
    }
  },
  metrics: {
    distance: "Distancia",
    movingTime: "Tiempo en movimiento",
    stoppedTime: "Tiempo detenido",
    totalTime: "Tiempo total",
    averageSpeed: "Velocidad media",
    movingSpeed: "Velocidad en movimiento",
    maxSpeed: "Velocidad máx.",
    elevationGain: "Desnivel positivo",
    elevationLoss: "Desnivel negativo",
    minElevation: "Elevación mín.",
    maxElevation: "Elevación máx.",
    elevationRange: "Rango de elevación"
  },
  map: {
    start: "Inicio",
    finish: "Fin",
    fallbackAria: "Ruta sin mapa base",
    fallbackCaption: "El mapa base no está disponible; se muestra la ruta sin OSM."
  },
  charts: {
    elevationUnavailable: "Datos de elevación no disponibles",
    elevationAria: "Perfil de elevación de la ruta",
    elevationSeries: "Perfil de elevación",
    elevationYAxis: "Elevación, m",
    elevationTooltipDistance: "Distancia",
    elevationTooltipElevation: "Elevación",
    minElevation: "Elevación mín.",
    maxElevation: "Elevación máx.",
    speedUnavailable: "Velocidad no disponible",
    speedAria: "Gráfico de velocidad de la ruta",
    speedTitle: "Velocidad",
    speedLegendRibbon: "banda",
    speedLegendAverage: "media",
    speedLegendMoving: "en movimiento",
    slopeUnavailable: "Pendiente no disponible",
    slopeAria: "Gráfico de pendiente de la ruta",
    slopeTitle: "Pendiente",
    slopeLegendUp: "subida",
    slopeLegendDown: "bajada"
  },
  templates: {
    routeReport: "Informe de ruta"
  },
  units: {
    km: "km",
    m: "m",
    kmh: "km/h",
    empty: "—"
  }
};

export default es;
