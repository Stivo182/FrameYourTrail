const de = {
  languageName: "Deutsch",
  site: {
    toolbarLabel: "Bedienfeld",
    tagline: "Verwandle jede Route in ein Poster",
    uploadFile: "Datei wählen",
    exportAria: "Poster exportieren",
    exportLabel: "Export:",
    clipboard: "Zwischenablage",
    emptyTitle: "Routendatei hochladen, um eine Routeninfografik zu erstellen",
    emptyBody: "Karte, Statistiken, Diagramme und Export sind nach der Dateianalyse verfügbar.",
    languageLabel: "Sprache"
  },
  messages: {
    unsupportedFile: "Wähle eine GPX-, TCX-, FIT- oder XML-Datei mit einer Route.",
    parseError: "Die Datei konnte nicht gelesen werden.",
    notXml: "Die Datei ist kein XML.",
    invalidXml: "Die XML-Datei konnte nicht analysiert werden.",
    emptyTrack: "Die Routendatei enthält keine Routenpunkte.",
    missingCoordinates: "Ein Routenpunkt enthält keine Koordinaten.",
    coordinatesOutOfBounds: "Ein Routenpunkt enthält Koordinaten außerhalb geografischer Grenzen.",
    insufficientPoints: "Die Routendatei muss mindestens zwei Routenpunkte enthalten.",
    missingElevation:
      "Die Routendatei enthält keine Höhendaten. Höhenmetriken und Diagramme werden ausgeblendet.",
    missingTime:
      "Die Routendatei enthält keine Zeitdaten. Geschwindigkeit und Bewegungszeit werden ausgeblendet.",
    largeFile: "Die Datei ist größer als 50 MB. Verarbeitung und Export können länger dauern.",
    terrainElevation:
      "Die Höhe wurde aus Geländedaten wiederhergestellt und kann von der Gerätehöhe abweichen.",
    terrainElevationUnavailable:
      "Geländehöhen sind nicht verfügbar. Die aktuellen Metriken bleiben erhalten.",
    exportError: "Das Poster konnte nicht exportiert werden.",
    previewRenderError: "Die Postervorschau konnte nicht gerendert werden."
  },
  analysis: {
    sourceLabel: "Kennzahlen",
    sourceSelectLabel: "Kennzahlenquelle",
    modeSelectLabel: "Kennzahlenquelle",
    modes: {
      recomputed_filtered: "Empfohlen",
      recomputed_raw: "Aus Trackpunkten",
      recomputed_terrain: "Geländehöhe",
      recomputed_terrain_request: "Geländehöhe laden",
      imported_summary: "Dateisummen"
    },
    modeDescriptions: {
      recomputed_filtered: "Bereinigt offensichtliche GPS-Fehler und nutzt Trackpunkte.",
      recomputed_raw: "Berechnet Kennzahlen aus Dateipunkten nach der Standardbereinigung neu.",
      recomputed_terrain: "Berechnet Kennzahlen mit Geländehöhe neu.",
      recomputed_terrain_request:
        "Lädt Geländehöhe und benötigt eine externe Abfrage über das Internet.",
      imported_summary:
        "Nutzt vom Gerät oder der App gespeicherte Summen und kann von Trackpunkten abweichen."
    }
  },
  mapStyle: {
    selectLabel: "Kartenstil",
    styles: {
      openfreemap_poster: {
        label: "OpenFreeMap",
        description: "Gedämpftes OpenFreeMap passend zur Posterpalette."
      },
      osm_standard: {
        label: "OSM Standard",
        description: "Vertraute allgemeine OpenStreetMap-Karte."
      },
      cyclosm: {
        label: "CyclOSM",
        description: "Karte für Fahrradrouten und Radinfrastruktur."
      }
    }
  },
  poster: {
    mapAria: "Routenkarte",
    elevationTitle: "Höhenprofil",
    elevationChartAria: "Diagramm des Höhenprofils",
    statsAria: "Routenstatistik",
    coordinatesAria: "Repräsentative Routenkoordinaten",
    latitudeLabel: "Breitengrad",
    longitudeLabel: "Längengrad",
    pointSummary: {
      one: "1 Trackpunkt",
      few: "{count} Trackpunkte",
      many: "{count} Trackpunkte",
      other: "{count} Trackpunkte"
    }
  },
  metrics: {
    distance: "Distanz",
    movingTime: "Bewegungszeit",
    stoppedTime: "Standzeit",
    totalTime: "Gesamtzeit",
    averageSpeed: "Durchschnittstempo",
    movingSpeed: "Tempo in Bewegung",
    maxSpeed: "Max. Tempo",
    elevationGain: "Höhengewinn",
    elevationLoss: "Höhenverlust",
    minElevation: "Min. Höhe",
    maxElevation: "Max. Höhe",
    elevationRange: "Höhendifferenz"
  },
  map: {
    start: "Start",
    finish: "Ziel",
    fallbackAria: "Route ohne Basiskarte",
    fallbackCaption: "Die Basiskarte ist nicht verfügbar, die Route wird ohne OSM angezeigt."
  },
  charts: {
    elevationUnavailable: "Höhendaten nicht verfügbar",
    elevationAria: "Routen-Höhenprofil",
    elevationSeries: "Höhenprofil",
    elevationYAxis: "Höhe, m",
    elevationTooltipDistance: "Distanz",
    elevationTooltipElevation: "Höhe",
    minElevation: "Min. Höhe",
    maxElevation: "Max. Höhe",
    speedUnavailable: "Geschwindigkeit nicht verfügbar",
    speedAria: "Geschwindigkeitsdiagramm der Route",
    speedTitle: "Geschwindigkeit",
    speedLegendRibbon: "Band",
    speedLegendAverage: "Durchschnitt",
    speedLegendMoving: "in Bewegung",
    slopeUnavailable: "Steigung nicht verfügbar",
    slopeAria: "Steigungsdiagramm der Route",
    slopeTitle: "Steigung",
    slopeLegendUp: "Anstieg",
    slopeLegendDown: "Abfahrt"
  },
  templates: {
    routeReport: "Routenbericht"
  },
  units: {
    km: "km",
    m: "m",
    kmh: "km/h",
    empty: "—"
  }
};

export default de;
