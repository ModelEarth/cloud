[DreamStudio](https://dreamstudio.com)
# ModelEarth Cloud

## Our Google Cloud Run

[Our Cloud Run](run) - is being setup to run our [RealityStream Colab](https://model.earth/realitystream)

## Dev Folders

For new development testing, create a folder at [cloud/team/2025/[handle]](https://github.com/modelearth/cloud/)

1. Fork and clone our [cloud repo](https://github.com/modelearth/cloud) and [localsite repo](https://github.com/modelearth/localsite). 

2. Turn on GitHub Pages for both. So [account].github.io/cloud works.

3. In the "team/2025" subfolder, add a folder with your handle matching your name in our [Member List](https://model.earth/community/members).  
Use lowercase and optionally include your last initial.

4. Copy the [index.html page](https://github.com/ModelEarth/cloud/blob/main/index.html) to your new folder. Change the title to a description of the folder's content and/or add your handle in parentheses.

5. Add your code additions and document in a README.md file.

6. Submit a Pull Request (PR), and include a URL link in the following format when sending an email to Loren to pull your additions.
[account].github.io/cloud/team/2025/[handle]


Generally avoid commiting datasets in the cloud repo.  
Load datasets directly from other GitHub repos, Google Sheets and/or APIs.


## Cloudflare Workers Option
<!--
CoLabs + [Anvil](https://anvil.works/learn/tutorials/data-science#connecting-notebooks) + [Plotly](https://plotly.com/python) and [Seaborn](https://seaborn.pydata.org/examples/index.html) + [Cursor](https://www.cursor.com/) 
-->
To try: [Cloudflare Workers](https://developers.cloudflare.com/workers/) app.


## RealityStream Project

[RealityStream](https://model.earth/realitystream) is our main ML python project, in addition we have:

[Industry Imputation](https://model.earth/machine-learning) - Estimating business patterns
<!--
[Financial](/finance) - Credit market probability analysis  
-->