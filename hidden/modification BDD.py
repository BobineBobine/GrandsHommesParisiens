import os
import json
import requests
from openai import OpenAI

# Charger la clé API OpenAI depuis un fichier caché .env dans le même dossier que ce script
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
api_key = None
if os.path.exists(env_path):
    with open(env_path, "r", encoding="utf-8") as env_file:
        for line in env_file:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("OPENAI_API_KEY"):
                key, value = line.split("=", 1)
                value = value.strip().strip('"').strip("'")
                if key.strip() == "OPENAI_API_KEY" and value:
                    api_key = value
                    break
if not api_key:
    raise RuntimeError(f"OPENAI_API_KEY not found or empty in .env file at {env_path}")

client = OpenAI(api_key=api_key)

# Charger le fichier GeoJSON
file_path = r'H:\Mon Drive\Projets persos\GrandsHommesParisiens\hidden\plaques_commemoratives.geojson'
with open(file_path, 'r', encoding='utf-8') as f:
    geojson_data = json.load(f)

# Nouveau prompt pour extraire les années au format "YYYY_YYYY" ou "null"
def extract_years(retranscription):
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "user", "content": f"Dans ce texte : {retranscription}\nExtrait UNIQUEMENT les années de début et de fin du séjour de la personne sous la forme 'YYYY_YYYY' (exemple : 1939_1945). Si aucune année n'est trouvée, retourne 'null'."}
        ]
    )
    return response.choices[0].message.content.strip()

# Nouveau prompt pour catégorisation stricte
def determine_category(titre):
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "user", "content": f"Catégorise strictement '{titre}' en une seule valeur parmi : personnalite, groupe, monument, evenement, null. Retourne uniquement la catégorie, sans phrase ni explication."}
        ]
    )
    return response.choices[0].message.content.strip().lower()

# Obtenir le nombre de visites de la page Wikipédia à partir du titre (avec underscores), sur une période large (par mois)
def get_wikipedia_views_from_title(nom):
    wikipedia_title = nom.replace(' ', '_')
    api_url = f"https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/fr.wikipedia/all-access/all-agents/{wikipedia_title}/monthly/20230101/20231231"
    headers = {"User-Agent": "GrandsHommesParisiensBot/1.0 (contact: gaumontalexis@gmail.com)"}
    try:
        response = requests.get(api_url, headers=headers, timeout=10)
        if response.status_code == 200:
            data = response.json()
            return sum(item['views'] for item in data['items'])
        else:
            print(f"Erreur Wikipedia API pour {wikipedia_title} : code {response.status_code}")
    except requests.RequestException as e:
        print(f"Erreur de connexion Wikipedia API pour {wikipedia_title} : {e}")
    return 0

# Compléter les données GeoJSON
for feature in geojson_data['features']:
    retranscription = feature['properties'].get('retranscription', '')
    titre = feature['properties'].get('titre', '')

    if retranscription and titre:
        # Déterminer la catégorie stricte
        categorie = determine_category(titre)
        feature['properties']['categorie'] = categorie

        # Extraire les années au format "YYYY_YYYY" ou "null"
        years = extract_years(retranscription)
        if years and years != "null" and "_" in years:
            parts = years.split("_")
            if len(parts) == 2:
                debut, fin = parts
                feature['properties']['annee_debut'] = debut
                feature['properties']['annee_fin'] = fin
            else:
                feature['properties']['annee_debut'] = ""
                feature['properties']['annee_fin'] = ""
        else:
            feature['properties']['annee_debut'] = ""
            feature['properties']['annee_fin'] = ""

        # Obtenir le nombre de visites de la page Wikipédia uniquement pour les personnalités
        if categorie == "personnalite":
            feature['properties']['score_popularite'] = get_wikipedia_views_from_title(titre)
        else:
            feature['properties']['score_popularite'] = 1

# Sauvegarder le fichier GeoJSON mis à jour
output_file_path = r'H:\Mon Drive\Projets persos\GrandsHommesParisiens\hidden\plaques_commemoratives.geojson'
with open(output_file_path, 'w', encoding='utf-8') as f:
    json.dump(geojson_data, f, ensure_ascii=False, indent=4)

print("Le fichier GeoJSON a été mis à jour avec les nouvelles catégories.")

# Test simple pour vérifier que l'API fonctionne
if __name__ == "__main__":
    test_nom = "Georges_Perec"
    views = get_wikipedia_views_from_title(test_nom)
    print(f"Score popularité pour {test_nom} : {views}")
