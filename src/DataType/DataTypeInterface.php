<?php
namespace EdtfDataType\DataType;

use Doctrine\ORM\QueryBuilder;
use EdtfDataType\Entity\EdtfDataTypeEdtf;
use Omeka\Api\Adapter\AdapterInterface;
use Omeka\Entity\Value;

interface DataTypeInterface
{
    /**
     * Get the fully qualified name of the corresponding entity.
     *
     * @return string
     */
    public function getEntityClass();

    /**
     * Set the number value(s) to a number entity.
     *
     * @param EdtfDataTypeEdtf $entity
     * @param Value $value
     */
    public function setEntityValues(EdtfDataTypeEdtf $entity, Value $value);

    /**
     * Build an EDTF query.
     *
     * @param AdapterInterface $adapter
     * @param QueryBuilder $qb
     * @param array $query
     */
    public function buildQuery(AdapterInterface $adapter, QueryBuilder $qb, array $query);

    /**
     * Sort an EDTF query.
     *
     * @param AdapterInterface $adapter
     * @param QueryBuilder $qb
     * @param array $query
     * @param string $type
     * @param int $propertyId
     */
    public function sortQuery(AdapterInterface $adapter, QueryBuilder $qb, array $query, $type, $propertyId);
}
