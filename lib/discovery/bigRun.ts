// Keepa Product Finder selections from the tuning PWA's Big Run.
// These apply only to Big Run, independently of the scheduled stream settings.
const presets = {
  "power_tools_main": {
    "streamId": "outdoor_power_tools",
    "selection": {
      "productType": [
        0
      ],
      "singleVariation": true,
      "current_SALES_gte": 1,
      "current_SALES_lte": 100000,
      "current_BUY_BOX_SHIPPING_gte": 2000,
      "isLowest90_BUY_BOX_SHIPPING": true,
      "deltaPercent30_BUY_BOX_SHIPPING_gte": 5,
      "deltaPercent90_BUY_BOX_SHIPPING_gte": 5,
      "rootCategory": [
        228013
      ],
      "categories_exclude": [
        "553336",
        "553284",
        "553578",
        "553350",
        "553406",
        "553232",
        "553612"
      ],
      "brand": [
        "dewalt",
        "flex",
        "makita",
        "metabo hpt",
        "milwaukee",
        "skil",
        "skilsaw",
        "wen"
      ],
      "perPage": 1000,
      "page": 0
    }
  },
  "trusted_sellers": {
    "streamId": "trusted_sellers",
    "selection": {
      "productType": [
        "0"
      ],
      "singleVariation": true,
      "categories_exclude": [
        "13398401",
        "13399631",
        "17881622011",
        "511228"
      ],
      "current_RATING_gte": 40,
      "current_COUNT_REVIEWS_gte": 50,
      "current_BUY_BOX_SHIPPING_gte": 2000,
      "isLowest90_BUY_BOX_SHIPPING": true,
      "deltaPercent90_BUY_BOX_SHIPPING_gte": 8,
      "buyBoxSellerId": [
        "A243EQ592JSXT3",
        "A2F8KAB7F15GZF",
        "A2EJCTH67GJMT3",
        "A4ZSBADJP7DJM",
        "AUEUXQQV6YS3R",
        "A3U8XSBQ9122LC",
        "A1DR7HYJVQI5BJ",
        "A29JP04ZKKF9MP",
        "A1WO0LWTFI0BL8",
        "A2O561G1SPZ87O",
        "A2PQBA7L2BFM79"
      ],
      "rootCategory": [
        "228013"
      ],
      "brand": [
        "✜fein"
      ],
      "sort": [
        [
          "lastPriceChange",
          "desc"
        ]
      ],
      "perPage": 100,
      "page": 0
    }
  },
  "dudes_power": {
    "streamId": "dad_power",
    "selection": {
      "productType": [
        0
      ],
      "singleVariation": true,
      "categories_exclude": [
        "7073956011",
        "464394",
        "3011391011"
      ],
      "current_BUY_BOX_SHIPPING_gte": 3000,
      "isLowest90_BUY_BOX_SHIPPING": true,
      "deltaPercent30_BUY_BOX_SHIPPING_gte": 8,
      "deltaPercent90_BUY_BOX_SHIPPING_gte": 5,
      "brand": [
        "bluetti",
        "ecoflow",
        "goal zero",
        "jackery",
        "zendure"
      ],
      "sort": [
        [
          "current_SALES",
          "asc"
        ],
        [
          "monthlySold",
          "desc"
        ]
      ],
      "perPage": 1000,
      "page": 0
    }
  },
  "woodworking_test": {
    "streamId": "woodworking_general",
    "selection": {
      "productType": [
        0
      ],
      "singleVariation": true,
      "current_BUY_BOX_SHIPPING_gte": 3000,
      "isLowest90_BUY_BOX_SHIPPING": true,
      "deltaPercent30_BUY_BOX_SHIPPING_gte": 10,
      "categories_exclude": [
        511228,
        511276,
        2380871011,
        511260,
        573760011,
        573759011,
        511286,
        511240,
        511396,
        13399701,
        511382,
        511306,
        9628891011,
        335116011
      ],
      "current_SALES_lte": 450000,
      "current_RATING_gte": 43,
      "current_COUNT_REVIEWS_gte": 80,
      "categories_include": [
        553158,
        3207128011,
        553152,
        553153,
        5739459011,
        552866,
        552888,
        552880,
        552886,
        552882,
        552884,
        552962,
        552910,
        552940,
        553220,
        2445476011,
        8906593011,
        552936,
        21213614011,
        21213620011,
        553020,
        553022,
        553602
      ],
      "sort": [
        [
          "current_SALES",
          "asc"
        ]
      ],
      "page": 0,
      "perPage": 1000
    }
  }
};

export function getBigRunPreset(name: string) {
  return Object.hasOwn(presets, name) ? presets[name as keyof typeof presets] : undefined;
}
