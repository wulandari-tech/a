const axios = require('axios');
const FOREST_API_KEY = process.env.FOREST_API_KEY;
const FOREST_BASE_URL = 'https://rescenic.web.id/api/h2h';
const PROFIT_PERCENTAGE_PPOB = parseFloat(process.env.PROFIT_PERCENTAGE_PPOB) || 0;

async function getForestPriceList(apiCategory, apiSlug, filterCode = null) {
    let apiUrl = `${FOREST_BASE_URL}/price-list/${apiCategory}/${apiSlug}?api_key=${FOREST_API_KEY}&profit_percent=${PROFIT_PERCENTAGE_PPOB}`;
    if (filterCode) {
        apiUrl += `&filter_code=${filterCode}`;
    }
    console.log(`ForestAPI Service: Fetching price list from ${apiUrl}`);
    try {
        const response = await axios.get(apiUrl);
        if (response.data && response.data.status === 'success' && Array.isArray(response.data.data)) {
            return response.data.data;
        } else {
            console.error(`ForestAPI Error for ${apiCategory}/${apiSlug}${filterCode ? '/'+filterCode : ''}:`, response.data.message || 'Invalid data structure');
            return [];
        }
    } catch (error) {
        console.error(`Error fetching ForestAPI price list for ${apiCategory}/${apiSlug}${filterCode ? '/'+filterCode : ''}:`, error.message);
        return [];
    }
}

module.exports = {
    getForestPriceList
};