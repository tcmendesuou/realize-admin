import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';
import '../styles/CompaniesManager.css';

function CompaniesManager() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    type: 'cliente',
    cnpj: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    street: '',
    city: '',
    state: '',
    active: true
  });

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    setLoading(true);
    try {
      const companiesSnapshot = await getDocs(collection(db, 'companies'));
      const companiesData = companiesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setCompanies(companiesData);
    } catch (error) {
      console.error('Erro ao carregar empresas:', error);
      alert('Erro ao carregar empresas');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCompany = (company) => {
    setSelectedCompany(company);
    setFormData({
      name: company.name || '',
      type: company.type || 'cliente',
      cnpj: company.cnpj || '',
      contactName: company.contact?.name || '',
      contactEmail: company.contact?.email || '',
      contactPhone: company.contact?.phone || '',
      street: company.address?.street || '',
      city: company.address?.city || '',
      state: company.address?.state || '',
      active: company.active !== undefined ? company.active : true
    });
  };

  const handleNewCompany = () => {
    setSelectedCompany(null);
    setFormData({
      name: '',
      type: 'cliente',
      cnpj: '',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      street: '',
      city: '',
      state: '',
      active: true
    });
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert('Nome da empresa é obrigatório');
      return;
    }

    setSaving(true);
    try {
      const companyData = {
        name: formData.name,
        type: formData.type,
        cnpj: formData.cnpj,
        contact: {
          name: formData.contactName,
          email: formData.contactEmail,
          phone: formData.contactPhone
        },
        address: {
          street: formData.street,
          city: formData.city,
          state: formData.state
        },
        active: formData.active,
        updatedAt: new Date()
      };

      if (selectedCompany) {
        await updateDoc(doc(db, 'companies', selectedCompany.id), companyData);
        alert('Empresa atualizada com sucesso!');
      } else {
        companyData.createdAt = new Date();
        await addDoc(collection(db, 'companies'), companyData);
        alert('Empresa criada com sucesso!');
      }

      await loadCompanies();
      handleNewCompany();
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar empresa');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedCompany) return;

    if (!window.confirm(`Tem certeza que deseja excluir ${selectedCompany.name}?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'companies', selectedCompany.id));
      alert('Empresa excluída com sucesso!');
      await loadCompanies();
      handleNewCompany();
    } catch (error) {
      console.error('Erro ao excluir:', error);
      alert('Erro ao excluir empresa');
    }
  };

  const filteredCompanies = companies.filter(company => {
    const matchesSearch = company.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         company.cnpj?.includes(searchTerm);
    const matchesType = !filterType || company.type === filterType;
    return matchesSearch && matchesType;
  });

  if (loading) {
    return (
      <div className="companies-manager-container">
        <div className="loading">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="companies-manager-container">
      <div className="companies-manager-header">
        <h1>Gestão de Empresas</h1>
        <p className="subtitle">Gerencie empresas de clientes e fornecedores</p>
      </div>

      <div className="two-panel-layout">
        {/* PAINEL 1: LISTA */}
        <div className="panel panel-list">
          <div className="panel-header">
            <h2>Empresas</h2>
            <button className="btn-new" onClick={handleNewCompany}>
              + Nova
            </button>
          </div>

          <div className="search-filters">
            <input
              type="text"
              placeholder="Buscar por nome ou CNPJ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="filter-select"
            >
              <option value="">Todos os tipos</option>
              <option value="cliente">Clientes</option>
              <option value="fornecedor">Fornecedores</option>
            </select>
          </div>

          <div className="companies-list">
            {filteredCompanies.length === 0 ? (
              <div className="empty-state">
                <p>Nenhuma empresa encontrada</p>
              </div>
            ) : (
              filteredCompanies.map(company => (
                <div
                  key={company.id}
                  className={`company-card ${selectedCompany?.id === company.id ? 'selected' : ''}`}
                  onClick={() => handleSelectCompany(company)}
                >
                  <div className="company-card-header">
                    <h3>{company.name}</h3>
                    <span className={`status-badge ${company.active ? 'active' : 'inactive'}`}>
                      {company.active ? 'Ativa' : 'Inativa'}
                    </span>
                  </div>
                  <p className="company-type">
                    {company.type === 'cliente' ? 'Cliente' : 'Fornecedor'}
                  </p>
                  {company.cnpj && (
                    <p className="company-cnpj">CNPJ: {company.cnpj}</p>
                  )}
                  {company.contact?.email && (
                    <p className="company-contact">{company.contact.email}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* PAINEL 2: FORMULÁRIO */}
        <div className="panel panel-form">
          <div className="panel-header">
            <h2>{selectedCompany ? 'Editar Empresa' : 'Nova Empresa'}</h2>
          </div>

          <div className="form-content">
            <div className="form-section">
              <h3>Dados da Empresa</h3>

              <div className="form-group">
                <label>Nome da Empresa *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Ex: Ford Brasil"
                />
              </div>

              <div className="form-group">
                <label>Tipo *</label>
                <select
                  name="type"
                  value={formData.type}
                  onChange={handleChange}
                >
                  <option value="cliente">Cliente</option>
                  <option value="fornecedor">Fornecedor</option>
                </select>
              </div>

              <div className="form-group">
                <label>CNPJ</label>
                <input
                  type="text"
                  name="cnpj"
                  value={formData.cnpj}
                  onChange={handleChange}
                  placeholder="00.000.000/0000-00"
                />
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="active"
                    checked={formData.active}
                    onChange={handleChange}
                  />
                  Empresa ativa
                </label>
              </div>
            </div>

            <div className="form-section">
              <h3>Contato Principal</h3>

              <div className="form-group">
                <label>Nome do Contato</label>
                <input
                  type="text"
                  name="contactName"
                  value={formData.contactName}
                  onChange={handleChange}
                  placeholder="Ex: João Silva"
                />
              </div>

              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  name="contactEmail"
                  value={formData.contactEmail}
                  onChange={handleChange}
                  placeholder="contato@empresa.com"
                />
              </div>

              <div className="form-group">
                <label>Telefone</label>
                <input
                  type="tel"
                  name="contactPhone"
                  value={formData.contactPhone}
                  onChange={handleChange}
                  placeholder="(11) 99999-9999"
                />
              </div>
            </div>

            <div className="form-section">
              <h3>Endereço</h3>

              <div className="form-group">
                <label>Rua/Avenida</label>
                <input
                  type="text"
                  name="street"
                  value={formData.street}
                  onChange={handleChange}
                  placeholder="Rua ABC, 123"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Cidade</label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    placeholder="São Paulo"
                  />
                </div>

                <div className="form-group">
                  <label>Estado</label>
                  <input
                    type="text"
                    name="state"
                    value={formData.state}
                    onChange={handleChange}
                    placeholder="SP"
                    maxLength="2"
                  />
                </div>
              </div>
            </div>

            <div className="form-actions">
              {selectedCompany && (
                <button className="btn-delete" onClick={handleDelete} disabled={saving}>
                  Excluir
                </button>
              )}
              <button className="btn-cancel" onClick={handleNewCompany} disabled={saving}>
                Cancelar
              </button>
              <button className="btn-save" onClick={handleSave} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CompaniesManager;
