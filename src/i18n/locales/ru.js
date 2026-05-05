const ru = {
  languageName: "Русский",
  site: {
    toolbarLabel: "Панель управления",
    tagline: "Превратите любой маршрут в постер",
    uploadFile: "Выбрать файл",
    exportAria: "Экспорт постера",
    exportLabel: "Экспорт:",
    clipboard: "В буфер",
    emptyTitle: "Загрузите файл маршрута, чтобы собрать инфографику",
    emptyBody: "Карта, статистика, графики и экспорт будут доступны после анализа файла.",
    languageLabel: "Язык"
  },
  messages: {
    unsupportedFile: "Выберите GPX, TCX, FIT или XML-файл с треком.",
    parseError: "Не удалось прочитать файл.",
    notXml: "Файл не является XML.",
    invalidXml: "XML-файл не удалось разобрать.",
    emptyTrack: "Файл трека не содержит точек маршрута.",
    missingCoordinates: "Точка маршрута не содержит координаты.",
    coordinatesOutOfBounds: "Точка маршрута содержит координаты вне географических границ.",
    insufficientPoints: "Файл трека должен содержать минимум две точки маршрута.",
    missingElevation: "В файле трека нет высот. Высотные метрики и графики будут скрыты.",
    missingTime: "В файле трека нет времени. Скорость и время в движении будут скрыты.",
    largeFile: "Файл больше 50 МБ. Обработка и экспорт могут занять больше времени.",
    terrainElevation:
      "Высота восстановлена по данным рельефа и может отличаться от высоты устройства.",
    terrainElevationUnavailable: "Данные рельефа недоступны. Оставлены текущие метрики.",
    exportError: "Не удалось экспортировать постер.",
    previewRenderError: "Не удалось отрисовать предпросмотр постера."
  },
  analysis: {
    sourceLabel: "Показатели",
    sourceSelectLabel: "Источник показателей",
    modeSelectLabel: "Источник показателей",
    modes: {
      recomputed_filtered: "Рекомендуемые",
      recomputed_raw: "По точкам трека",
      recomputed_terrain: "По высотам рельефа",
      recomputed_terrain_request: "Загрузить высоты рельефа",
      imported_summary: "Итоги из файла"
    },
    modeDescriptions: {
      recomputed_filtered: "Убирает явные ошибки GPS и считает по точкам трека.",
      recomputed_raw: "Пересчитывает показатели по точкам файла после стандартной очистки.",
      recomputed_terrain: "Пересчитывает показатели с высотами рельефа.",
      recomputed_terrain_request:
        "Загружает высоты рельефа и требует внешнего запроса через интернет.",
      imported_summary:
        "Использует итоги, записанные устройством или приложением, и может отличаться от точек трека."
    }
  },
  mapStyle: {
    selectLabel: "Стиль карты",
    styles: {
      openfreemap_poster: {
        label: "OpenFreeMap",
        description: "Приглушённый OpenFreeMap под палитру постера."
      },
      osm_standard: {
        label: "OSM Standard",
        description: "Привычная универсальная карта OpenStreetMap."
      },
      cyclosm: {
        label: "CyclOSM",
        description: "Карта для веломаршрутов и велоинфраструктуры."
      }
    }
  },
  poster: {
    mapAria: "Карта маршрута",
    elevationTitle: "Профиль высоты",
    elevationChartAria: "График профиля высоты",
    statsAria: "Статистика маршрута",
    coordinatesAria: "Координаты репрезентативной точки маршрута",
    latitudeLabel: "Широта",
    longitudeLabel: "Долгота",
    pointSummary: {
      one: "{count} точка трека",
      few: "{count} точки трека",
      many: "{count} точек трека",
      other: "{count} точки трека"
    }
  },
  metrics: {
    distance: "Дистанция",
    movingTime: "Время в движении",
    stoppedTime: "Время остановки",
    totalTime: "Общее время",
    averageSpeed: "Средняя скорость",
    movingSpeed: "Скорость в движении",
    maxSpeed: "Макс. скорость",
    elevationGain: "Набор высоты",
    elevationLoss: "Сброс высоты",
    minElevation: "Мин. высота",
    maxElevation: "Макс. высота",
    elevationRange: "Перепад высот"
  },
  map: {
    start: "Старт",
    finish: "Финиш",
    fallbackAria: "Маршрут без карты-подложки",
    fallbackCaption: "Карта-подложка недоступна, показан маршрут без OSM."
  },
  charts: {
    elevationUnavailable: "Высотные данные недоступны",
    elevationAria: "Профиль высоты маршрута",
    elevationSeries: "Профиль высоты",
    elevationYAxis: "Высота, м",
    elevationTooltipDistance: "Дистанция",
    elevationTooltipElevation: "Высота",
    minElevation: "Мин. высота",
    maxElevation: "Макс. высота",
    speedUnavailable: "Скорость недоступна",
    speedAria: "График скорости маршрута",
    speedTitle: "Скорость",
    speedLegendRibbon: "лента",
    speedLegendAverage: "средняя",
    speedLegendMoving: "в движении",
    slopeUnavailable: "Уклон недоступен",
    slopeAria: "График уклона маршрута",
    slopeTitle: "Уклон",
    slopeLegendUp: "подъём",
    slopeLegendDown: "спуск"
  },
  templates: {
    routeReport: "Маршрутный отчет"
  },
  units: {
    km: "км",
    m: "м",
    kmh: "км/ч",
    empty: "—"
  }
};

export default ru;
