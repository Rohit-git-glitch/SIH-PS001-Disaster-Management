# SIH-PS001-Disaster-Management
# Backend ke liye main file = assam_landslide_xgb_model.json 🧠
# Map/output ke liye = Assam_XGBoost_Landslide_Probability.tif 🗺️

## # Assam Landslide Prediction & Early Warning System

## 📌 Project Overview

This project is an AI/ML-based Landslide Prediction System for Assam.

The system uses environmental and geographical data from Google Earth Engine (GEE), historical landslide data, and a trained XGBoost machine learning model to estimate landslide probability across Assam.

The main goal is to identify areas with higher landslide risk and provide prediction results that can later be integrated with a backend and interactive map.

---

## 🏗️ System Workflow

The complete workflow is:

GEE Environmental Data
        ↓
Feature Preparation
        ↓
Historical Landslide Data
        ↓
Training Dataset
        ↓
Machine Learning Model
        ↓
XGBoost Prediction
        ↓
Assam Pixel-wise Prediction
        ↓
GeoTIFF Output
        ↓
GEE Interactive Map / Backend

---

## 🌍 Study Area

Current study area:

- State: Assam, India
- Prediction: Across the Assam region

The system can later be extended to other states of the North Eastern Region (NER).

---

## 📊 Input Features

The model uses 6 environmental features:

1. Elevation
2. Slope
3. Rainfall
4. NDVI
5. Soil Clay
6. Land Cover

Feature order used by the trained model:

```text
Elevation
Slope
Rainfall
NDVI
SoilClay
LandCover

┌──────────────────────────────┐
                 │       GOOGLE EARTH ENGINE    │
                 │            (GEE)             │
                 └──────────────┬───────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
              ▼                 ▼                 ▼
         Elevation           Slope            Rainfall
          (SRTM)          (SRTM Terrain)       (CHIRPS)
              │                 │                 │
              └─────────────────┼─────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
              ▼                 ▼                 ▼
            NDVI             Soil Clay        Land Cover
           (MODIS)         (SoilGrids)       (WorldCover)
              │                 │                 │
              └─────────────────┼─────────────────┘
                                ▼
                  ┌────────────────────────┐
                  │  6-FEATURE PREDICTOR  │
                  │       RASTER           │
                  │        GeoTIFF          │
                  └────────────┬───────────┘
                               │
                               ▼
                  ┌────────────────────────┐
                  │    PYTHON / JUPYTER    │
                  │                        │
                  │ Historical Landslide   │
                  │ Data + Background Data │
                  └────────────┬───────────┘
                               │
                               ▼
                  ┌────────────────────────┐
                  │   DATA PREPROCESSING   │
                  │                        │
                  │ 6 Features + Labels    │
                  │ Spatial Train/Test     │
                  └────────────┬───────────┘
                               │
                               ▼
                  ┌────────────────────────┐
                  │    XGBOOST MODEL       │
                  │      TRAINING          │
                  └────────────┬───────────┘
                               │
                               ▼
                  ┌────────────────────────┐
                  │  TRAINED XGBOOST MODEL │
                  │       xgb_final        │
                  └────────────┬───────────┘
                               │
                               ▼
             ┌──────────────────────────────────┐
             │ NEW / UNSEEN ASSAM RASTER PIXELS │
             │                                  │
             │ Elevation                         │
             │ Slope                             │
             │ Rainfall                          │
             │ NDVI                              │
             │ SoilClay                          │
             │ LandCover                         │
             └────────────────┬─────────────────┘
                              │
                              ▼
                  ┌────────────────────────┐
                  │ PIXEL-WISE PREDICTION  │
                  │                        │
                  │ Landslide Probability  │
                  └────────────┬───────────┘
                               │
                               ▼
                  ┌────────────────────────┐
                  │   PREDICTION OUTPUT     │
                  │                        │
                  │ GeoTIFF (.tif)         │
                  │ Probability Raster     │
                  └────────────┬───────────┘
                               │
                               ▼
                  ┌────────────────────────┐
                  │       GEE MAP           │
                  │                        │
                  │ Risk Visualization     │
                  │ + Environmental Layers │
                  └────────────┬───────────┘
                               
                  
