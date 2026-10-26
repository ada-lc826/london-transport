// Every data source the demo uses, with the credit its licence asks for (plan §8: one list,
// shown in S8 and in the README). Keep the README's "Data and attribution" section in step.

export type Attribution = {
    publisher: string;
    data: string;
    credit: string;
};

export const ATTRIBUTIONS: Attribution[] = [
    {
        publisher: 'Transport for London',
        data: 'Unified API, Journey Planner, station topology, NUMBAT demand, lift disruptions',
        credit: 'Powered by TfL Open Data. Contains OS data © Crown copyright and database rights 2016 and Geomni UK Map data © and database rights [2019].'
    },
    {
        publisher: 'Office for National Statistics',
        data: 'Census 2021 TS038 and TS007A (via Nomis); MSOA population weighted centroids',
        credit: 'Source: Office for National Statistics licensed under the Open Government Licence v3.0. Contains National Statistics data © Crown copyright and database right 2025; contains OS data © Crown copyright and database right 2025.'
    },
    {
        publisher: 'Ministry of Housing, Communities and Local Government',
        data: 'English Indices of Deprivation 2025',
        credit: 'Contains public sector information licensed under the Open Government Licence v3.0.'
    }
];

export const REPO_URL = 'https://github.com/ada-lc826/london-transport';
